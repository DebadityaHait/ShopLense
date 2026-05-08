import { describe, expect, it } from "vitest";
import { buildNtfyPayload, evaluateAlert } from "./alerts";

describe("alerts", () => {
  it("triggers when lowest price is below target", () => {
    const result = evaluateAlert(
      { ruleType: "LOWEST_BELOW", targetPrice: 100 },
      [
        { name: "A", price: 120, vendor: "ZEPTO" },
        { name: "A", price: 99, vendor: "BLINKIT" },
      ],
    );
    expect(result.triggered).toBe(true);
    expect(result.candidate?.vendor).toBe("BLINKIT");
  });

  it("triggers percentage drops from baseline", () => {
    const result = evaluateAlert({ ruleType: "DROP_PERCENT", baselinePrice: 200, dropPercent: 20 }, [
      { name: "A", price: 150, vendor: "ZEPTO" },
    ]);
    expect(result.triggered).toBe(true);
  });

  it("builds ntfy payloads", () => {
    expect(buildNtfyPayload("Matched", "https://example.com")).toEqual({
      title: "Price alert",
      message: "Matched",
      tags: "moneybag",
      click: "https://example.com",
    });
  });

  it("triggers back-in-stock alerts from availability", () => {
    const result = evaluateAlert({ ruleType: "BACK_IN_STOCK" }, [
      { name: "Zepto Chicken Breast", price: 0, available: false, vendor: "ZEPTO" },
      { name: "Zepto Chicken Breast", price: 220, available: true, vendor: "ZEPTO" },
    ]);

    expect(result.triggered).toBe(true);
    expect(result.message).toContain("back in stock");
  });
});
