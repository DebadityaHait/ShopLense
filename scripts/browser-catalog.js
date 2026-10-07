"use strict";

const { runPlaywrightAsync } = require("./playwright-runner");
const { openArguments, sessionUrl, isClosedSession } = require("./browser-sessions");
const sessions = new Map();

function parseCliResult(stdout) {
  const match = stdout.match(/### Result\r?\n([\s\S]*?)(?=\r?\n### |$)/);
  if (!match) throw new Error("No browser result. Open the marketplace's Playwright session and select a delivery location.");
  return JSON.parse(match[1].trim());
}

async function runCatalogCode(session, code) {
  // A persistent browser tab is shared mutable state; serialize reads within this process.
  const previous = sessions.get(session) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const args = [`-s=${session}`, "run-code", code];
    let stdout;
    try {
      stdout = await runPlaywrightAsync(args);
      if (isClosedSession({ stdout })) throw Object.assign(new Error("Closed browser session"), { stdout });
    }
    catch (error) {
      const url = sessionUrl(session);
      if (!url || !isClosedSession(error)) throw new Error("Browser operation failed. Check the headless session and delivery location; no headed fallback was attempted.");
      await runPlaywrightAsync(openArguments(session, url), {
        env: { ...process.env, PLAYWRIGHT_MCP_HEADLESS: "true" },
      });
      stdout = await runPlaywrightAsync(args);
    }
    const result = parseCliResult(stdout);
    if (result.error) throw new Error(result.error);
    return result;
  });
  sessions.set(session, next);
  try { return await next; }
  finally { if (sessions.get(session) === next) sessions.delete(session); }
}

async function fetchBlinkitBrowser({ url, query, lat, lon, postbackParams, session }) {
  const target = new URL(url || `/v1/layout/search?q=${encodeURIComponent(query)}&search_type=type_to_search`, "https://blinkit.com");
  if (target.origin !== "https://blinkit.com" || target.pathname !== "/v1/layout/search") {
    throw new Error("Unexpected Blinkit pagination URL");
  }
  const args = { url: target.href, lat, lon, body: postbackParams || {} };
  const result = await runCatalogCode(session || process.env.BLINKIT_PLAYWRIGHT_SESSION || "blinkit_normal", `async page => {
    if (!page.url().startsWith('https://blinkit.com/')) return { error: 'Open blinkit_normal on Blinkit and select a delivery location.' };
    return await page.evaluate(async args => {
      const response = await fetch(args.url, { method: 'POST', credentials: 'include', headers: {
        'content-type': 'application/json', app_client: 'consumer_web', app_version: '1010101010',
        lat: String(args.lat), lon: String(args.lon)
      }, body: JSON.stringify(args.body), signal: AbortSignal.timeout(12000) });
      const text = await response.text();
      if (!response.ok) return { error: 'Blinkit browser search failed: HTTP ' + response.status };
      try { return { payload: JSON.parse(text) }; }
      catch { return { error: 'Blinkit browser returned a non-JSON response.' }; }
    }, ${JSON.stringify(args)});
  }`);
  if (!result.payload?.is_success) throw new Error("Blinkit browser search did not succeed");
  return { payload: result.payload, cookie: "" };
}

async function searchZeptoBrowser({ query, pages, session, lat, lon }) {
  return runCatalogCode(session || process.env.ZEPTO_PLAYWRIGHT_SESSION || "zepto_normal", `async page => {
    if (!page.url().startsWith('https://www.zepto.com/') && !page.url().startsWith('https://www.zeptonow.com/')) return {error:'Open zepto_normal on Zepto and select a delivery location.'};
    const query = ${JSON.stringify(query)};
    const expected = ${JSON.stringify({ lat, lon })};
    const positionCookie = (await page.context().cookies()).find(c=>c.name==='user_position' && c.domain.includes('zepto'));
    let position;
    try { position=JSON.parse(decodeURIComponent(positionCookie?.value || '')); } catch {}
    if (expected.lat != null && expected.lon != null && (!position ||
        position.latitude == null || position.longitude == null ||
        !Number.isFinite(Number(position.latitude)) || !Number.isFinite(Number(position.longitude)) ||
        Math.abs(Number(position.latitude)-expected.lat)>0.001 || Math.abs(Number(position.longitude)-expected.lon)>0.001)) {
      return {error:'Zepto browser delivery location differs from the search coordinates. Select the matching location in zepto_normal before comparing prices.'};
    }
    const matches = (response, pageNumber) => {
      if (!response.url().includes('/user-search-service/api/v3/search') || response.request().method() !== 'POST') return false;
      try { const body=response.request().postDataJSON(); return body.query === query && body.pageNumber === pageNumber; }
      catch { return false; }
    };
    const first = page.waitForResponse(r => matches(r, 0), {timeout:12000}).then(response=>({response})).catch(()=>null);
    await page.goto('https://www.zepto.com/search?query=' + encodeURIComponent(query), {waitUntil:'domcontentloaded',timeout:15000});
    const unavailable = page.getByText(/Coming Soon/).first().waitFor({state:'visible',timeout:12000})
      .then(()=>({unserviceable:true})).catch(()=>null);
    const outcome = await Promise.race([first,unavailable]);
    if (outcome?.unserviceable) return {error:'Zepto does not serve the delivery location selected in its browser session.'};
    if (!outcome?.response) return {error:'Zepto did not return catalog data. Confirm the selected delivery location is serviceable.'};
    const response = outcome.response;
    if (await page.getByRole('button',{name:'Select Location',exact:true}).isVisible().catch(()=>false)) {
      return {error:'Select a delivery location in the Zepto browser before searching. Default-location prices are not a valid comparison.'};
    }
    if (!response.ok()) return {error:'Zepto browser search failed: HTTP ' + response.status()};
    const headers = await response.request().allHeaders();
    const payloads = [await response.json()];
    for(let index=1;index<${JSON.stringify(pages)};index++) {
      if(payloads[payloads.length-1].hasReachedEnd) break;
      const next = page.waitForResponse(r=>matches(r,index),{timeout:8000});
      await page.mouse.wheel(0,20000);
      try { const r=await next; if(!r.ok()) return {error:'Zepto browser pagination failed: HTTP '+r.status()}; payloads.push(await r.json()); }
      catch { return {error:'Zepto did not return the next search page. Requested pagination could not be completed.'}; }
    }
    return {payloads,storeId:headers.store_id || headers.storeid,location:position};
  }`);
}

module.exports = { fetchBlinkitBrowser, searchZeptoBrowser, runCatalogCode, parseCliResult };
