#!/usr/bin/env node
"use strict";

const { runPlaywright } = require("./playwright-runner");
const { openArguments } = require("./browser-sessions");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    lat: process.env.SWIGGY_LAT || "",
    lon: process.env.SWIGGY_LON || "",
    pincode: process.env.SWIGGY_PINCODE || "",
    query: process.env.SWIGGY_QUERY || "milk",
    session: process.env.SWIGGY_PLAYWRIGHT_SESSION || "swiggy_normal",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--lat") {
      args.lat = next;
      i += 1;
    } else if (arg === "--lon" || arg === "--lng") {
      args.lon = next;
      i += 1;
    } else if (arg === "--pincode" || arg === "--pin") {
      args.pincode = next;
      i += 1;
    } else if (arg === "--query" || arg === "-q") {
      args.query = next;
      i += 1;
    } else if (arg === "--session") {
      args.session = next;
      i += 1;
    } else if (arg === "--headed") {
      args.headed = true;
    }
  }

  if (args.lat == null || args.lon == null || String(args.lat).trim() === "" || String(args.lon).trim() === "" ||
      !Number.isFinite(Number(args.lat)) || Math.abs(Number(args.lat)) > 90 ||
      !Number.isFinite(Number(args.lon)) || Math.abs(Number(args.lon)) > 180) {
    throw new Error("Usage: npm run swiggy:location -- --lat 12.817127 --lon 80.04044 --pincode 603203");
  }
  return args;
}

function cookieString(stdout) {
  return stdout
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => line.split(" ")[0])
    .join("; ");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessionArg = `-s=${args.session}`;
  const origin = "https://www.swiggy.com";
  const url = `${origin}/instamart/search?custom_back=true&query=${encodeURIComponent(args.query)}`;

  runPlaywright([sessionArg, "close"]);
  runPlaywright(openArguments(args.session, "about:blank", args.headed), {
    env: { ...process.env, PLAYWRIGHT_MCP_HEADLESS: args.headed ? "false" : "true" },
  });
  runPlaywright([
    sessionArg,
    "run-code",
    `async page => {
      await page.context().grantPermissions(['geolocation'], { origin: '${origin}' });
      await page.context().setGeolocation({ latitude: ${Number(args.lat)}, longitude: ${Number(args.lon)} });
      await page.goto('${origin}/instamart', { waitUntil: 'domcontentloaded', timeout: 15000 });
      const share = page.getByRole('button', { name: /Share location|Use current location/ }).first();
      const visible = await share.waitFor({state:'visible',timeout:3000}).then(()=>true).catch(()=>false);
      if (visible) await share.click();
      await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const cookies = await page.context().cookies('${origin}');
        if (cookies.some(c => c.name === 'lat') && cookies.some(c => c.name === 'lng')) break;
        await page.waitForTimeout(250);
      }
    }`,
  ]);

  if (args.headed) {
    if (!process.stdin.isTTY) throw new Error("Interactive setup needs a terminal. Omit --headed for unattended setup.");
    console.log("Select the matching delivery address in the browser, then press Enter here.");
    process.stdin.resume();
    await new Promise((resolve) => process.stdin.once("data", resolve));
    process.stdin.pause();
  }

  const cookies = cookieString(runPlaywright([sessionArg, "cookie-list", "--domain=www.swiggy.com"]));
  if (!cookies) throw new Error("No Swiggy cookies were captured. Confirm the Playwright browser has a selected Swiggy delivery location.");
  if (!/(?:^|;\s*)lat=/.test(cookies) || !/(?:^|;\s*)lng=/.test(cookies)) {
    throw new Error("Swiggy has not saved a delivery location. Run setup with --headed on a desktop for address confirmation; no cookie file was overwritten.");
  }
  require("../swiggy_scraper").validateLocation(cookies, Number(args.lat), Number(args.lon));

  fs.writeFileSync(path.join(process.cwd(), "swiggy_cookie.txt"), cookies);
  fs.writeFileSync(
    path.join(process.cwd(), "swiggy_location.json"),
    `${JSON.stringify({ lat: Number(args.lat), lon: Number(args.lon), pincode: args.pincode, query: args.query, updatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log("Saved swiggy_cookie.txt and swiggy_location.json");
}

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { parseArgs, cookieString };
