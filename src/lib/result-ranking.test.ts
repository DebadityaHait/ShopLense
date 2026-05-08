import { describe, expect, it } from "vitest";
import { filterAndSortGroups } from "./result-ranking";
import type { ProductGroupResult, VendorProduct } from "./types";

const baseProduct = {
  id: "p",
  vendor: "ZEPTO",
  platformName: "Zepto",
  name: "",
  brand: "",
  available: true,
  images: [],
  mrp: null,
  offerPrice: null,
  quantity: "500 g",
  deeplink: null,
  rating: null,
  ratingCount: null,
  inventory: null,
  sla: null,
  raw: {},
} satisfies VendorProduct;

function group(name: string, price: number, productName = name): ProductGroupResult {
  return {
    id: name,
    canonicalName: name,
    brand: "",
    quantity: "500g",
    normalizedKey: name,
    confidence: 1,
    lowestPrice: price,
    vendorSpread: 0,
    products: [{ ...baseProduct, id: name, name: productName, offerPrice: price }],
  };
}

describe("result ranking", () => {
  it("filters out results missing a required search word", () => {
    const results = filterAndSortGroups(
      [
        group("Chicken Masala Powder", 80),
        group("Chicken Curry Cut", 160),
        group("Chicken Breast Boneless", 220),
      ],
      "chicken breast",
      true,
      "RELEVANCE",
    );

    expect(results.map((item) => item.canonicalName)).toEqual(["Chicken Breast Boneless"]);
  });

  it("keeps broad results when keyword requirement is disabled", () => {
    const results = filterAndSortGroups(
      [group("Chicken Masala Powder", 80), group("Chicken Breast Boneless", 220)],
      "chicken breast",
      false,
      "RELEVANCE",
    );

    expect(results.map((item) => item.canonicalName)).toEqual(["Chicken Breast Boneless", "Chicken Masala Powder"]);
  });

  it("can sort by discount amount", () => {
    const discounted = group("Chicken Breast Boneless", 220);
    discounted.products[0].mrp = 300;
    const cheaper = group("Chicken Breast Fillet", 180);
    cheaper.products[0].mrp = 190;

    const results = filterAndSortGroups([cheaper, discounted], "chicken breast", true, "DISCOUNT_AMOUNT");
    expect(results[0].canonicalName).toBe("Chicken Breast Boneless");
  });
});
