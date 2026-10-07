#!/usr/bin/env node
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { runPlaywright } = require("./playwright-runner");

const vendors = {
  BLINKIT: { session: "blinkit_normal", url: "https://blinkit.com/" },
  ZEPTO: { session: "zepto_normal", url: "https://www.zepto.com/" },
  SWIGGY: { session: "swiggy_normal", url: "https://www.swiggy.com/instamart" },
};

function sessionConfig(vendor) {
  const config = vendors[vendor];
  if (!config) throw new Error("Unknown browser vendor");
  return { ...config, session: process.env[`${vendor}_PLAYWRIGHT_SESSION`] || config.session };
}

function openArguments(session, url, headed = false) {
  return [`-s=${session}`, "open", "--browser=chrome", "--persistent", ...(headed ? ["--headed"] : []), url];
}

function sessionUrl(session) {
  return Object.keys(vendors).map(sessionConfig).find(config => config.session === session)?.url;
}

function isClosedSession(error) {
  return /(?:browser.*not open|no open browser)/i.test(`${error.stdout || ""}\n${error.stderr || ""}`);
}

function main(argv = process.argv.slice(2)) {
  require("@next/env").loadEnvConfig(path.resolve(__dirname, ".."));
  const index = argv.indexOf("--vendors");
  const selected = index < 0 ? Object.keys(vendors) : (argv[index + 1] || "").toUpperCase().split(",");
  if (selected.some(vendor => !vendors[vendor])) throw new Error("Use --vendors BLINKIT,ZEPTO,SWIGGY");
  const headed = argv.includes("--headed");
  const stop = argv.includes("--stop");
  const stateIndex = argv.indexOf("--state");
  const state = stateIndex < 0 ? null : path.resolve(argv[stateIndex + 1] || "");
  if (state && (stop || selected.length !== 1 || !fs.existsSync(state))) {
    throw new Error("State import requires one vendor and an existing storage-state file");
  }
  for (const vendor of selected) {
    const { session, url } = sessionConfig(vendor);
    // Restart explicitly so a previously visible session cannot remain visible.
    runPlaywright([`-s=${session}`, "close"]);
    if (!stop) {
      runPlaywright(openArguments(session, state ? "about:blank" : url, headed), {
        env: { ...process.env, PLAYWRIGHT_MCP_HEADLESS: headed ? "false" : "true" },
      });
      if (state) {
        runPlaywright([`-s=${session}`, "state-load", state]);
        runPlaywright([`-s=${session}`, "goto", url]);
      }
    }
    console.log(`${vendor}: ${stop ? "stopped" : headed ? "started headed" : "started headless"}`);
  }
}

if (require.main === module) {
  try { main(); }
  catch { console.error("Browser session startup failed. Check Chrome installation and delivery-location setup."); process.exitCode = 1; }
}

module.exports = { openArguments, sessionUrl, sessionConfig, isClosedSession, main };
