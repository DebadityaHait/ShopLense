// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { parseCliResult, fetchBlinkitBrowser } = require("./browser-catalog.js");
const { productItems, normalizeProduct } = require("../zepto_scraper.js");

describe("browser catalog transport", () => {
  it("parses only the CLI result, not the echoed code", () => {
    expect(parseCliResult('### Result\n{"payload":{"is_success":true}}\n### Ran Playwright code\n```js\nreturn {};\n```'))
      .toEqual({ payload: { is_success: true } });
  });
  it("supports CRLF and reports a missing session without exposing CLI output", () => {
    expect(parseCliResult('### Result\r\n{"count":1}\r\n### Page\r\n')).toEqual({ count: 1 });
    expect(() => parseCliResult('### Error\nprivate-cookie-value')).toThrow("No browser result");
  });
  it("rejects off-site and unrelated pagination URLs before invoking a browser", async () => {
    await expect(fetchBlinkitBrowser({ query: "biscuits", url: "https://example.com/v1/layout/search" }))
      .rejects.toThrow("Unexpected Blinkit pagination URL");
    await expect(fetchBlinkitBrowser({ query: "biscuits", url: "https://blinkit.com/account" }))
      .rejects.toThrow("Unexpected Blinkit pagination URL");
  });
  it("extracts Zepto products from promotion containers and excludes non-product tiles", () => {
    const product = { productResponse: { product: { name: "Test Biscuits", brand: "Test" },
      productVariant: { id: "variant-one", formattedPacksize: "100 g" }, outOfStock: false,
      availableQuantity: 4, discountedSellingPrice: 3600, mrp: 4000 } };
    const payload = { layout: [{ data: { resolver: { data: { items: [
      { title: "Promotion", items: [product] }, { title: "Unrelated tile" }, product,
    ] } } } }] };
    expect(productItems(payload)).toEqual([product, product]);
    expect(normalizeProduct(product)).toMatchObject({ id: "variant-one", name: "Test Biscuits", brand: "Test", available: true, offer_price: 36 });
  });
});
