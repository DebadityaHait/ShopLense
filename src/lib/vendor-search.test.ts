import { describe, expect, it, vi } from "vitest";
import { searchVendors } from "./vendor-search";

describe("vendor search", () => {
  it("clears the timeout timer after a successful request", async () => {
    vi.useFakeTimers();
    try {
      await searchVendors({
        query: "biscuits", lat: 12, lon: 80, pincode: "603203", vendors: ["BLINKIT"],
        loaders: { BLINKIT: () => async () => ({ products: [] }) },
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a hanging vendor as a partial failure after its deadline", async () => {
    vi.useFakeTimers();
    try {
      const pending = searchVendors({
        query: "biscuits", lat: 12, lon: 80, pincode: "603203", vendors: ["BLINKIT"], timeoutMs: 50,
        loaders: { BLINKIT: () => () => new Promise(() => {}) },
      });
      await vi.advanceTimersByTimeAsync(50);
      expect((await pending).errors).toEqual([{ vendor: "BLINKIT", message: "BLINKIT timed out after 50ms" }]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns partial failures without dropping successful products", async () => {
    const result = await searchVendors({
      query: "chicken",
      lat: 12,
      lon: 80,
      pincode: "603203",
      vendors: ["ZEPTO", "BLINKIT"],
      timeoutMs: 1000,
      loaders: {
        ZEPTO: () => async () => ({
          data: { total_results: 1, products: [{ id: "z1", name: "Chicken", offer_price: 99, available: true, platform: { name: "Zepto" } }] },
        }),
        BLINKIT: () => async () => {
          throw new Error("blocked");
        },
      },
    });
    expect(result.products).toHaveLength(1);
    expect(result.errors).toEqual([{ vendor: "BLINKIT", message: "blocked" }]);
  });

  it("adds an unavailable exact-product placeholder when a marketplace omits the requested item", async () => {
    const result = await searchVendors({
      query: "cheese",
      lat: 12,
      lon: 80,
      pincode: "603203",
      vendors: ["BLINKIT"],
      exactProductIds: { BLINKIT: "12345" },
      exactProductUrls: { BLINKIT: "https://blinkit.com/prn/x/prid/12345" },
      timeoutMs: 1000,
      loaders: {
        BLINKIT: () => async () => ({
          products: [{ id: "67890", name: "Other Cheese", offer_price: 99, available: true, platform: { name: "Blinkit" } }],
        }),
      },
    });

    expect(result.products[0]).toMatchObject({
      id: "12345",
      vendor: "BLINKIT",
      available: false,
      inventory: 0,
      deeplink: "https://blinkit.com/prn/x/prid/12345",
    });
  });

  it("passes Flipkart Minutes-only mode without regular marketplace fallback", async () => {
    let receivedOptions: Record<string, unknown> | null = null;
    await searchVendors({
      query: "milk",
      lat: 12,
      lon: 80,
      pincode: "603203",
      vendors: ["FLIPKART"],
      flipkartHyperlocalOnly: true,
      timeoutMs: 1000,
      loaders: {
        FLIPKART: () => async (options) => {
          receivedOptions = options;
          return { products: [] };
        },
      },
    });

    expect(receivedOptions).toMatchObject({ marketplace: "HYPERLOCAL", allowFallback: false });
  });
});
