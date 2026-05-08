#!/usr/bin/env node
"use strict";

const { execFileSync } = require("child_process");
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
    }
  }

  if (!Number.isFinite(Number(args.lat)) || !Number.isFinite(Number(args.lon))) {
    throw new Error("Usage: npm run swiggy:location -- --lat 12.817127 --lon 80.04044 --pincode 603203");
  }
  return args;
}

function runPlaywright(args, options = {}) {
  const bin = process.env.PLAYWRIGHT_CLI || "playwright-cli";
  return execFileSync(bin, args, {
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
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

  runPlaywright([sessionArg, "open", "--browser=chrome", "--persistent", origin], { stdio: "inherit" });
  runPlaywright([
    sessionArg,
    "run-code",
    `async page => {
      await page.context().grantPermissions(['geolocation'], { origin: '${origin}' });
      await page.context().setGeolocation({ latitude: ${Number(args.lat)}, longitude: ${Number(args.lon)} });
    }`,
  ]);
  runPlaywright([sessionArg, "goto", url], { stdio: "inherit" });

  console.log("");
  console.log("If Swiggy asks for an address, select the address/pincode in the opened browser, then press Enter here.");
  process.stdin.resume();
  await new Promise((resolve) => process.stdin.once("data", resolve));
  process.stdin.pause();

  const cookies = cookieString(runPlaywright([sessionArg, "cookie-list", "--domain=www.swiggy.com"]));
  if (!cookies) throw new Error("No Swiggy cookies were captured. Confirm the Playwright browser is logged into/location-set on Swiggy.");

  fs.writeFileSync(path.join(process.cwd(), "swiggy_cookie.txt"), cookies);
  fs.writeFileSync(
    path.join(process.cwd(), "swiggy_location.json"),
    `${JSON.stringify({ lat: Number(args.lat), lon: Number(args.lon), pincode: args.pincode, query: args.query, updatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log("Saved swiggy_cookie.txt and swiggy_location.json");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
