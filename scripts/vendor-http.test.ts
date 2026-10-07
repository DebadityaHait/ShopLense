// @vitest-environment node
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { readVendorJson } = require("./vendor-http.js");
const { scrapeZepto } = require("../zepto_scraper.js");
const { scrapeBlinkit } = require("../blinkit_scraper.js");
const { scrapeFlipkart } = require("../flipkart_scraper.js");
const { resolvePlaywrightCommand } = require("./playwright-runner.js");

afterEach(() => vi.unstubAllGlobals());

describe("vendor response handling", () => {
  it("runs an explicit Playwright JavaScript entrypoint through Node without a shell", () => {
    expect(resolvePlaywrightCommand("cli-entry.js")).toEqual([process.execPath, ["cli-entry.js"]]);
  });
  it("reports empty HTTP 202 responses without a JSON parser error", async () => {
    await expect(readVendorJson(new Response("", { status: 202 }), "Zepto serviceability"))
      .rejects.toThrow(/HTTP 202, .*empty response/);
  });

  it("does not expose upstream response bodies in errors", async () => {
    const response = new Response("private-session-value", { status: 403 });
    await expect(readVendorJson(response, "Blinkit search")).rejects.toThrow("HTTP 403");
    await expect(readVendorJson(new Response("private-session-value", { status: 403 }), "Blinkit search"))
      .rejects.not.toThrow("private-session-value");
  });

  it("reports successful HTML responses as non-JSON", async () => {
    await expect(readVendorJson(new Response("<html>challenge</html>"), "Search"))
      .rejects.toThrow("non-JSON response");
  });

  it("does not silently search a default Zepto store after a denied location request", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("", { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    await expect(scrapeZepto({ query: "biscuits", lat: 13.12345, lon: 80.12345, transport: "http" }))
      .rejects.toThrow("Zepto serviceability failed: HTTP 403");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].signal).toBeTruthy();
  });

  it("uses Blinkit library defaults instead of size=undefined or skipping all pages", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await scrapeBlinkit({ query: "biscuits", lat: 12, lon: 80 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain("size=20");
  });

  it("reports the Flipkart Minutes location gate instead of a successful empty catalog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      RESPONSE: { pageMeta: { redirectionObject: { url: "/location" } } },
    }))));
    await expect(scrapeFlipkart({ query: "biscuits", pincode: "603203", marketplace: "HYPERLOCAL", allowFallback: false }))
      .rejects.toThrow("location/address gate");
  });
});
