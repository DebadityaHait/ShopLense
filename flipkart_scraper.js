#!/usr/bin/env node
"use strict";

const crypto = require("crypto");

const API_URL = "https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false";
const BASE_URL = "https://www.flipkart.com";
const PLATFORM_ICON = "https://d2chhaxkq6tvay.cloudfront.net/platforms/flipkart.webp";

function parseArgs(argv) {
  const args = {
    query: "chicken",
    pincode: "603203",
    pages: 1,
    marketplace: "HYPERLOCAL",
    allowFallback: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--query" || arg === "-q") {
      args.query = next;
      i += 1;
    } else if (arg === "--pincode" || arg === "--pin") {
      args.pincode = String(next);
      i += 1;
    } else if (arg === "--pages") {
      args.pages = Math.max(1, Number(next) || 1);
      i += 1;
    } else if (arg === "--marketplace") {
      args.marketplace = next;
      i += 1;
    } else if (arg === "--no-fallback") {
      args.allowFallback = false;
    }
  }

  if (!args.query || !/^\d{6}$/.test(args.pincode)) {
    throw new Error("Usage: node flipkart_scraper.js --query chicken --pincode 603203");
  }

  return args;
}

function uuidLike(seed) {
  const hash = crypto.createHash("sha256").update(seed).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

function pageUri({ query, marketplace, page }) {
  const params = new URLSearchParams({
    q: query,
    otracker: "search",
    otracker1: "search",
    "as-show": "on",
    as: "off",
  });
  if (marketplace) params.set("marketplace", marketplace);
  if (page > 1) params.set("page", String(page));
  return `/search?${params.toString()}`;
}

function buildBody({ query, pincode, marketplace, page, paginationContextMap, ssid }) {
  const pageContext = {
    trackingContext: {
      context: {
        eVar51: "direct_browse",
        eVar61: "direct_browse",
      },
    },
    fetchSeoData: page === 1,
    networkSpeed: 10000,
  };

  if (page > 1 && paginationContextMap) {
    pageContext.fetchSeoData = true;
    pageContext.paginatedFetch = true;
    pageContext.pageNumber = page;
    pageContext.paginationContextMap = paginationContextMap;
  }

  return {
    pageUri: pageUri({ query, marketplace, page }),
    pageContext,
    requestContext: {
      type: "BROWSE_PAGE",
      ssid,
      sqid: uuidLike(`${query}:${pincode}:${marketplace || "default"}:${page}`),
    },
    locationContext: {
      pincode: Number(pincode),
      changed: false,
    },
  };
}

async function fetchPage({ query, pincode, marketplace, page, paginationContextMap, ssid }) {
  const body = JSON.stringify(buildBody({ query, pincode, marketplace, page, paginationContextMap, ssid }));
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      flipkart_secure: "true",
      origin: BASE_URL,
      referer: `${BASE_URL}/`,
      "user-agent": ua,
      "x-user-agent": `${ua} FKUA/website/41/website/Desktop`,
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Flipkart search failed: HTTP ${response.status} ${text}`);
  }
  return JSON.parse(text);
}

function productCards(payload) {
  const slots = payload?.RESPONSE?.slots || [];
  return slots
    .filter((slot) => slot?.widget?.type === "PRODUCT_SUMMARY")
    .flatMap((slot) => slot?.widget?.data?.products || []);
}

function totalResults(payload) {
  const sortSlot = (payload?.RESPONSE?.slots || []).find((slot) => slot?.widget?.type === "FILTER_SORT_OPTIONS");
  return (
    sortSlot?.widget?.data?.totalProducts ||
    payload?.RESPONSE?.pageData?.trackingContext?.tracking?.maxProductsCount ||
    productCards(payload).length
  );
}

function imageUrl(url) {
  if (!url) return null;
  return url
    .replace("{@width}", "400")
    .replace("{@height}", "400")
    .replace("{@quality}", "80");
}

function extractDeliveryText(pricing) {
  const parts = pricing?.plusPriceInfo?.data;
  if (!Array.isArray(parts)) return null;
  const text = parts.map((part) => part?.value?.text).filter(Boolean).join("").replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizeProduct(card) {
  const info = card?.productInfo || {};
  const value = info.value || {};
  const action = info.action || {};
  const pricing = value.pricing || {};
  const rating = value.rating || {};
  const id = value.id || action?.params?.productId || "";
  const listingId = value.listingId || action?.params?.listingId || "";
  const deeplinkPath = action.url || value.baseUrl || "";
  const available = value.availability?.displayState === "IN_STOCK";

  return {
    id,
    name: value.titles?.title || value.titles?.newTitle || "",
    brand: value.productBrand || value.titles?.superTitle || "",
    available,
    images: (value.media?.images || []).map((image) => imageUrl(image.url)).filter(Boolean),
    mrp: pricing.mrp?.value ?? null,
    offer_price: pricing.finalPrice?.value ?? pricing.prices?.find((price) => !price.strikeOff)?.value ?? null,
    quantity: value.titles?.subtitle || "",
    deeplink: deeplinkPath
      ? new URL(deeplinkPath, BASE_URL).toString()
      : id
        ? `${BASE_URL}/product/p/itme?pid=${encodeURIComponent(id)}${listingId ? `&lid=${encodeURIComponent(listingId)}` : ""}`
        : null,
    rating: typeof rating.average === "number" && rating.average > 0 ? rating.average : null,
    rating_count: rating.count || null,
    inventory: null,
    platform: {
      name: "Flipkart",
      sla: extractDeliveryText(pricing),
      open: available,
      icon: PLATFORM_ICON,
    },
  };
}

async function scrapeFlipkart(options) {
  let marketplace = options.marketplace;
  const ssid = uuidLike(`${options.query}:${options.pincode}:${Date.now()}`).replaceAll("-", "").slice(0, 24);
  let firstPayload = await fetchPage({
    query: options.query,
    pincode: options.pincode,
    marketplace,
    page: 1,
    ssid,
  });

  const redirectedToLocationGate = Boolean(firstPayload?.RESPONSE?.pageMeta?.redirectionObject);
  if (redirectedToLocationGate && options.allowFallback && marketplace === "HYPERLOCAL") {
    marketplace = "";
    firstPayload = await fetchPage({
      query: options.query,
      pincode: options.pincode,
      marketplace,
      page: 1,
      ssid,
    });
  }

  const products = productCards(firstPayload).map(normalizeProduct);
  const total = totalResults(firstPayload);

  for (let page = 2; page <= options.pages; page += 1) {
    const paginationContextMap = firstPayload?.RESPONSE?.pageData?.paginationContextMap;
    const payload = await fetchPage({
      query: options.query,
      pincode: options.pincode,
      marketplace,
      page,
      paginationContextMap,
      ssid,
    });
    products.push(...productCards(payload).map(normalizeProduct));
    firstPayload = payload;
  }

  const seen = new Set();
  const uniqueProducts = products.filter((product) => {
    if (!product.id || seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });

  return {
    query: options.query,
    platform: marketplace === "HYPERLOCAL" ? "Flipkart Minutes" : "Flipkart",
    pincode: options.pincode,
    total_results: total || uniqueProducts.length,
    products: uniqueProducts,
  };
}

if (require.main === module) {
  scrapeFlipkart(parseArgs(process.argv.slice(2)))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { scrapeFlipkart };
