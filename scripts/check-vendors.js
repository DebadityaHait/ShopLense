#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");
require("@next/env").loadEnvConfig(path.resolve(__dirname, ".."));

const flags = process.argv.slice(2);
function option(name, fallback) {
  const index = flags.indexOf(`--${name}`);
  return index < 0 ? fallback : flags[index + 1];
}
const options = {
  query: option("query", "biscuits"),
  lat: Number(option("lat", "12.817127")),
  lon: Number(option("lon", "80.04044")),
  pincode: option("pincode", "603203"),
  pages: Number(option("pages", "1")),
};
const timeoutMs = Number(option("timeout", "20000"));
const vendors = {
  ZEPTO: ["zepto_scraper.js", "scrapeZepto", {}],
  BLINKIT: ["blinkit_scraper.js", "scrapeBlinkit", {}],
  FLIPKART: ["flipkart_scraper.js", "scrapeFlipkart", { marketplace: "", allowFallback: false }],
  MINUTES: ["flipkart_scraper.js", "scrapeFlipkart", { marketplace: "HYPERLOCAL", allowFallback: false }],
  SWIGGY: ["swiggy_scraper.js", "scrapeSwiggy", {}],
};
const selected = option("vendors", Object.keys(vendors).join(",")).split(",").map((value) => value.toUpperCase());
if (!options.query || !Number.isFinite(options.lat) || Math.abs(options.lat) > 90 ||
    !Number.isFinite(options.lon) || Math.abs(options.lon) > 180 || !/^\d{6}$/.test(options.pincode) ||
    !Number.isInteger(options.pages) || options.pages < 1 || options.pages > 3 ||
    !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000 || selected.some((vendor) => !vendors[vendor])) {
  console.error("Invalid options. Use --query, --lat, --lon, --pincode, --pages (1-3), --timeout (100-60000 ms), --vendors ZEPTO,BLINKIT,FLIPKART,MINUTES,SWIGGY.");
  process.exit(2);
}

// Isolate each integration so even synchronous CLI/session work has a hard deadline.
for (const vendor of selected) {
  const [file, exported, extra] = vendors[vendor];
  const source = `
    const scrape = require(${JSON.stringify(path.resolve(__dirname, "..", file))})[${JSON.stringify(exported)}];
    Promise.resolve().then(() => scrape(${JSON.stringify({ ...options, ...extra })})).then(result => {
      const data = result.data || result;
      const products = data.products;
      if (!Array.isArray(products)) throw new Error('Missing products array');
      if (products.some(p => !p.id || !p.name)) throw new Error('Missing product identity/name');
      if (new Set(products.map(p => p.id)).size !== products.length) throw new Error('Duplicate product IDs');
      if (products.some(p => p.offer_price != null && (typeof p.offer_price !== 'number' || !Number.isFinite(p.offer_price) || p.offer_price < 0))) throw new Error('Invalid normalized price');
      console.log(JSON.stringify({status: products.length ? 'PASS' : 'EMPTY', count: products.length, platform: data.platform}));
    }).catch(error => {
      console.log(JSON.stringify({status:'FAIL', error:String(error.message).split('\\n')[0].slice(0,300)}));
      process.exitCode = 1;
    });
  `;
  const started = Date.now();
  const child = spawnSync(process.execPath, ["-e", source], {
    cwd: path.resolve(__dirname, ".."), encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024,
  });
  let result;
  try {
    result = JSON.parse(child.stdout.trim());
  } catch {
    result = { status: "FAIL", error: child.error?.code === "ETIMEDOUT" ? `Timed out after ${timeoutMs}ms` : "Scraper process failed before returning a summary" };
  }
  if (result.status !== "PASS" || child.status !== 0) process.exitCode = 1;
  console.log(JSON.stringify({ vendor, ...result, elapsedMs: Date.now() - started }));
}
