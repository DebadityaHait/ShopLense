import { describe, expect, it } from "vitest";
import { groupProducts, normalizeQuantity } from "./product-normalization";
import type { VendorProduct } from "./types";

const base = {
  platformName: "",
  available: true,
  images: [],
  mrp: null,
  deeplink: null,
  rating: null,
  ratingCount: null,
  inventory: null,
  sla: null,
  raw: {},
};

function product(partial: Partial<VendorProduct>): VendorProduct {
  return {
    ...base,
    id: partial.id || "1",
    vendor: partial.vendor || "ZEPTO",
    name: partial.name || "",
    brand: partial.brand || "",
    quantity: partial.quantity || "",
    offerPrice: partial.offerPrice ?? null,
  };
}

describe("product normalization", () => {
  it("normalizes comparable quantities", () => {
    expect(normalizeQuantity("1 kg")).toBe("1000g");
    expect(normalizeQuantity("500 grams")).toBe("500g");
  });

  it("groups similar products with same quantity across vendors", () => {
    const groups = groupProducts([
      product({ id: "a", vendor: "ZEPTO", name: "Fresh Chicken Curry Cut", brand: "TenderCuts", quantity: "500 g", offerPrice: 180 }),
      product({ id: "b", vendor: "BLINKIT", name: "Chicken Curry Cut Fresh", brand: "TenderCuts", quantity: "500 grams", offerPrice: 175 }),
      product({ id: "c", vendor: "FLIPKART", name: "Chicken Breast Boneless", brand: "Other", quantity: "500 g", offerPrice: 220 }),
    ]);

    expect(groups[0].products).toHaveLength(2);
    expect(groups[0].lowestPrice).toBe(175);
  });

  it("does not group different cheese slice brands by generic tokens", () => {
    const groups = groupProducts([
      product({ id: "h1", vendor: "ZEPTO", name: "Heritage Cheese Slices", brand: "Heritage", quantity: "200 g", offerPrice: 130 }),
      product({ id: "h2", vendor: "BLINKIT", name: "Heritage Processed Cheese Slices", brand: "Heritage", quantity: "200 g", offerPrice: 128 }),
      product({ id: "a1", vendor: "FLIPKART", name: "Amul Processed Cheese Slices", brand: "Amul", quantity: "200 g", offerPrice: 125 }),
      product({ id: "m1", vendor: "SWIGGY", name: "Milky Mist Cheese Slices", brand: "Milky Mist", quantity: "200 g", offerPrice: 140 }),
    ]);

    const heritageGroup = groups.find((group) => group.brand === "Heritage");
    const brands = groups.map((group) => group.brand).sort();

    expect(heritageGroup?.products).toHaveLength(2);
    expect(brands).toEqual(["Amul", "Heritage", "Milky Mist"]);
  });

  it("can group when one scraper omits brand but title contains the brand", () => {
    const groups = groupProducts([
      product({ id: "h1", vendor: "ZEPTO", name: "Heritage Cheese Slices", brand: "Heritage", quantity: "200 g", offerPrice: 130 }),
      product({ id: "h2", vendor: "BLINKIT", name: "Heritage Processed Cheese Slices", brand: "", quantity: "200 g", offerPrice: 128 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].products).toHaveLength(2);
  });
});
