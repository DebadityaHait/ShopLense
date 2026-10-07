// @vitest-environment node
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { scrapeSwiggy, resolveSwiggyOptions, validateLocation } = require("../swiggy_scraper.js");
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function payload(id: string, nextOffset?: number, searchResultsOffset?: number) {
  return {
    statusCode: 0,
    data: {
      pageOffset: { nextOffset }, searchResultsOffset,
      cards: [{ card: { card: { gridElements: { infoWithStyle: { items: [{
        productId: id, inStock: true, isAvail: true,
        variations: [{ skuId: `${id}-sku`, displayName: "Test Biscuits", brandName: "Test",
          inventory: { inStock: true }, price: { offerPrice: { units: "36" }, mrp: { units: "40" } },
        }],
      }] } } } } }],
    },
  };
}

describe("anonymous Swiggy search", () => {
  it("rejects missing or mismatched session coordinates instead of returning another area's prices", () => {
    expect(() => validateLocation("session=test", 12, 80)).toThrow("delivery location differs");
    expect(() => validateLocation("lat=13; lng=80", 12, 80)).toThrow("delivery location differs");
    expect(() => validateLocation("lat=12.00005; lng=80.00005", 12, 80)).not.toThrow();
    expect(() => validateLocation("lat=invalid; lng=80", 12, 80)).toThrow("delivery location differs");
    expect(() => validateLocation("lat=s%3A12.00005.signature; lng=s%3A80.00005.signature", 12, 80)).not.toThrow();
    expect(() => validateLocation("lat=s%3A13.signature; lng=s%3A80.signature", 12, 80)).toThrow("delivery location differs");
  });
  it("does not load the historical matcher file by default", () => {
    vi.stubEnv("SWIGGY_MATCHER", "");
    expect(resolveSwiggyOptions({ cookie: "session=test" }).matcher).toBeFalsy();
    expect(resolveSwiggyOptions({ cookie: "session=test", matcher: "explicit" }).matcher).toBe("explicit");
  });

  it("carries both pagination cursors and keeps product-level links", async () => {
    vi.stubEnv("SWIGGY_MATCHER", "");
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload("one", 1, 32))))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload("two"))));
    vi.stubGlobal("fetch", fetch);
    const result = await scrapeSwiggy({ cookie: "session=test", query: "biscuits", pages: 3, buildVersion: "test-build" });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, request] = fetch.mock.calls[1];
    expect(new URL(url).searchParams.get("offset")).toBe("1");
    expect(JSON.parse(request.body).search_results_offset).toBe("32");
    expect(request.headers["x-build-version"]).toBe("test-build");
    expect(request.headers).not.toHaveProperty("matcher");
    expect(result.products).toHaveLength(2);
    expect(result.products[0]).toMatchObject({ id: "one", sku_id: "one-sku", offer_price: 36, deeplink: "https://www.swiggy.com/instamart/item/one" });
  });

  it("stops on a regressing pagination cursor", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload("one", 1, 32))))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload("two", 0, 64))));
    vi.stubGlobal("fetch", fetch);
    await scrapeSwiggy({ cookie: "session=test", query: "biscuits", pages: 5 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("accepts numeric-string success status and rejects invalid sessions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response('{"statusCode":"0","data":{"cards":[]}}'))
      .mockResolvedValueOnce(new Response('{"statusCode":1}')));
    await expect(scrapeSwiggy({ cookie: "session=test", query: "biscuits" })).resolves.toMatchObject({ products: [] });
    await expect(scrapeSwiggy({ cookie: "session=test", query: "biscuits" })).rejects.toThrow("rejected the search session");
  });
});
