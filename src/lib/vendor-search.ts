import { createRequire } from "module";
import type { Vendor, VendorProduct, VendorResult } from "./types";

const requireFromHere = createRequire(import.meta.url);

const vendorModules = {
  ZEPTO: () => requireFromHere("../../zepto_scraper.js").scrapeZepto,
  BLINKIT: () => requireFromHere("../../blinkit_scraper.js").scrapeBlinkit,
  FLIPKART: () => requireFromHere("../../flipkart_scraper.js").scrapeFlipkart,
  SWIGGY: () => requireFromHere("../../swiggy_scraper.js").scrapeSwiggy,
} satisfies Record<Vendor, () => (options: Record<string, unknown>) => Promise<unknown>>;

export type SearchVendorsInput = {
  query: string;
  lat: number;
  lon: number;
  pincode: string;
  vendors: Vendor[];
  zeptoProductId?: string;
  exactProductIds?: Partial<Record<Vendor, string>>;
  exactProductUrls?: Partial<Record<Vendor, string>>;
  flipkartHyperlocalOnly?: boolean;
  timeoutMs?: number;
  loaders?: Partial<Record<Vendor, () => (options: Record<string, unknown>) => Promise<unknown>>>;
};

function timeout<T>(promise: Promise<T>, ms: number, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeVendorProduct(vendor: Vendor, product: any): VendorProduct {
  return {
    id: String(product?.id || `${vendor}:${product?.name || crypto.randomUUID()}`),
    vendor,
    platformName: product?.platform?.name || vendor,
    name: String(product?.name || ""),
    brand: String(product?.brand || ""),
    available: Boolean(product?.available),
    images: Array.isArray(product?.images) ? product.images.filter(Boolean) : [],
    mrp: toNumber(product?.mrp),
    offerPrice: toNumber(product?.offer_price ?? product?.offerPrice),
    quantity: String(product?.quantity || ""),
    deeplink: product?.deeplink || null,
    rating: toNumber(product?.rating),
    ratingCount: toNumber(product?.rating_count ?? product?.ratingCount),
    inventory: toNumber(product?.inventory),
    sla: product?.platform?.sla || null,
    raw: product,
  };
}

function normalizeEnvelope(vendor: Vendor, result: any): Omit<VendorResult, "vendor" | "ok"> {
  const data = result?.data || result || {};
  const products = Array.isArray(data.products)
    ? data.products.map((product: unknown) => normalizeVendorProduct(vendor, product))
    : [];
  return {
    products,
    totalResults: Number(data.total_results || data.totalResults || products.length),
    locationNote:
      vendor === "ZEPTO"
        ? data.store_id
          ? `Zepto stock uses resolved store ${data.store_id}.`
          : undefined
        : vendor === "FLIPKART"
        ? "Flipkart is aligned by pincode, not exact latitude/longitude."
        : vendor === "SWIGGY"
          ? "Swiggy Instamart uses the location stored in its browser session cookies."
          : undefined,
  };
}

function exactProductUrl(vendor: Vendor, id: string, rawUrl?: string) {
  if (rawUrl) return rawUrl;
  if (vendor === "ZEPTO") return `https://www.zepto.com/pn/x/pvid/${id}`;
  if (vendor === "BLINKIT") return `https://blinkit.com/prn/x/prid/${id}`;
  if (vendor === "SWIGGY") return `https://www.swiggy.com/instamart/item/${id}`;
  return `https://www.flipkart.com/product/p/itme?pid=${encodeURIComponent(id)}`;
}

function appendExactPlaceholder(
  envelope: Omit<VendorResult, "vendor" | "ok">,
  vendor: Vendor,
  id: string | undefined,
  rawUrl?: string,
) {
  if (!id || envelope.products.some((product) => product.id === id || product.deeplink === rawUrl)) return envelope;
  return {
    ...envelope,
    products: [
      {
        id,
        vendor,
        platformName: vendorLabels(vendor),
        name: `${vendorLabels(vendor)} exact product`,
        brand: "",
        available: false,
        images: [],
        mrp: null,
        offerPrice: null,
        quantity: "",
        deeplink: exactProductUrl(vendor, id, rawUrl),
        rating: null,
        ratingCount: null,
        inventory: 0,
        sla: null,
        raw: { exactPlaceholder: true },
      },
      ...envelope.products,
    ],
    totalResults: Math.max(envelope.totalResults, envelope.products.length + 1),
  };
}

function vendorLabels(vendor: Vendor) {
  if (vendor === "ZEPTO") return "Zepto";
  if (vendor === "BLINKIT") return "Blinkit";
  if (vendor === "FLIPKART") return "Flipkart";
  return "Swiggy Instamart";
}

async function runVendor(vendor: Vendor, input: SearchVendorsInput): Promise<VendorResult> {
  try {
    const scrape = (input.loaders?.[vendor] || vendorModules[vendor])();
    const baseOptions = { query: input.query, pages: 1 };
    const options =
      vendor === "FLIPKART"
        ? { ...baseOptions, pincode: input.pincode, ...(input.flipkartHyperlocalOnly ? { marketplace: "HYPERLOCAL", allowFallback: false } : {}) }
        : vendor === "SWIGGY"
          ? {
              ...baseOptions,
              ...(process.env.SWIGGY_COOKIE ? { cookie: process.env.SWIGGY_COOKIE } : {}),
              ...(process.env.SWIGGY_DEVICE_ID ? { deviceId: process.env.SWIGGY_DEVICE_ID } : {}),
              ...(process.env.SWIGGY_MATCHER ? { matcher: process.env.SWIGGY_MATCHER } : {}),
            }
          : { ...baseOptions, lat: input.lat, lon: input.lon };
    if (vendor === "ZEPTO" && input.zeptoProductId) {
      Object.assign(options, { productVariantId: input.zeptoProductId });
    }
    if (vendor === "ZEPTO" && input.exactProductIds?.ZEPTO) {
      Object.assign(options, { productVariantId: input.exactProductIds.ZEPTO });
    }
    const result = await timeout(Promise.resolve(scrape(options)), input.timeoutMs || 18000, vendor);
    const envelope = normalizeEnvelope(vendor, result);
    const withExact = appendExactPlaceholder(envelope, vendor, input.exactProductIds?.[vendor], input.exactProductUrls?.[vendor]);
    return { vendor, ok: true, ...withExact };
  } catch (error) {
    return {
      vendor,
      ok: false,
      products: [],
      totalResults: 0,
      error: error instanceof Error ? error.message : String(error),
      locationNote:
        vendor === "SWIGGY"
          ? "Refresh or provide Swiggy browser cookies with a valid Instamart location."
          : undefined,
    };
  }
}

export async function searchVendors(input: SearchVendorsInput) {
  const results = await Promise.all(input.vendors.map((vendor) => runVendor(vendor, input)));
  return {
    vendorResults: results,
    products: results.flatMap((result) => result.products),
    errors: results
      .filter((result) => !result.ok)
      .map((result) => ({ vendor: result.vendor, message: result.error || "Unknown vendor failure" })),
  };
}
