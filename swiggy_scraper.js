#!/usr/bin/env node
"use strict";
const { readVendorJson } = require("./scripts/vendor-http");
const { runPlaywright } = require("./scripts/playwright-runner");

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://www.swiggy.com";
const SEARCH_URL = `${BASE_URL}/api/instamart/search/v2`;
const PLATFORM_ICON = "https://d2chhaxkq6tvay.cloudfront.net/platforms/swiggy-instamart.webp";

function readOptionalFile(filename) {
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8").trim();
}

function getAutomatedCookie() {
  try {
    const stdout = runPlaywright([`-s=${process.env.SWIGGY_PLAYWRIGHT_SESSION || "swiggy_normal"}`, "cookie-list", "--domain=www.swiggy.com"], {
      timeout: 5000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const cookies = stdout
      .trim()
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => line.split(" ")[0])
      .join("; ");
    return cookies || "";
  } catch (err) {
    return "";
  }
}

function parseArgs(argv) {
  const args = {
    query: "chicken",
    pages: 1,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--query" || arg === "-q") {
      args.query = next;
      i += 1;
    } else if (arg === "--pages") {
      args.pages = Math.max(1, Number(next) || 1);
      i += 1;
    } else if (arg === "--cookie") {
      args.cookie = next;
      i += 1;
    } else if (arg === "--device-id") {
      args.deviceId = next;
      i += 1;
    } else if (arg === "--matcher") {
      args.matcher = next;
      i += 1;
    } else if (arg === "--build-version") {
      args.buildVersion = next;
      i += 1;
    }
  }

  const resolved = resolveSwiggyOptions(args);

  if (!resolved.query) {
    throw new Error("Usage: node swiggy_scraper.js --query chicken --cookie \"<browser cookies>\"");
  }
  if (!resolved.cookie) {
    throw new Error("Swiggy requires browser cookies with location and aws-waf-token. Set SWIGGY_COOKIE or pass --cookie.");
  }

  return resolved;
}

function resolveSwiggyOptions(options = {}) {
  const cookie = options.cookie || process.env.SWIGGY_COOKIE || readOptionalFile("swiggy_cookie.txt") || getAutomatedCookie();
  const deviceId = options.deviceId || process.env.SWIGGY_DEVICE_ID || (cookie ? extractDeviceId(cookie) : "") || crypto.randomUUID();
  // A historical matcher file can invalidate an otherwise healthy anonymous session.
  const matcher = options.matcher || process.env.SWIGGY_MATCHER;

  return {
    ...options,
    query: options.query || "chicken",
    pages: Math.max(1, Number(options.pages) || 1),
    cookie,
    deviceId,
    matcher,
    buildVersion: options.buildVersion || process.env.SWIGGY_BUILD_VERSION || "2.381.0",
  };
}

function extractDeviceId(cookie) {
  const match = cookie.match(/(?:^|;\s*)deviceId=s%3A([^.;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function validateLocation(cookie, lat, lon) {
  if (lat == null || lon == null) return;
  function coordinate(name) {
    const value = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
    try {
      if (value == null) return NaN;
      let decoded = decodeURIComponent(value);
      if (decoded.startsWith("s:")) {
        const separator = decoded.lastIndexOf(".");
        if (separator <= 2) return NaN;
        decoded = decoded.slice(2, separator);
      }
      return Number(decoded);
    }
    catch { return NaN; }
  }
  const selectedLat = coordinate("lat");
  const selectedLon = coordinate("lng");
  if (!Number.isFinite(selectedLat) || !Number.isFinite(selectedLon) ||
      Math.abs(selectedLat - lat) > 0.001 || Math.abs(selectedLon - lon) > 0.001) {
    throw new Error("Swiggy browser delivery location differs from the search coordinates. Select the matching location in swiggy_normal before comparing prices.");
  }
}

function buildUrl(offset) {
  const params = new URLSearchParams({
    offset: String(offset),
    ageConsent: "false",
    voiceSearchTrackingId: "",
    storeId: "",
    primaryStoreId: "",
    secondaryStoreId: "",
  });
  return `${SEARCH_URL}?${params.toString()}`;
}

function buildBody(query, resultsOffset) {
  return {
    facets: [],
    sortAttribute: "",
    query,
    search_results_offset: String(resultsOffset),
    page_type: "INSTAMART_SEARCH_PAGE",
    is_pre_search_tag: false,
  };
}

async function fetchSearchPage({ query, offset, resultsOffset, cookie, deviceId, matcher, buildVersion }) {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    origin: BASE_URL,
    referer: `${BASE_URL}/instamart/search?custom_back=true&query=${encodeURIComponent(query)}`,
    "user-agent": ua,
    "x-build-version": buildVersion,
    "x-device-id": deviceId,
    cookie,
  };
  if (matcher) headers.matcher = matcher;

  const response = await fetch(buildUrl(offset), {
    method: "POST",
    headers,
    body: JSON.stringify(buildBody(query, resultsOffset)),
    signal: AbortSignal.timeout(15000),
  });

  const payload = await readVendorJson(response, "Swiggy search");
  if (payload.statusCode != null && String(payload.statusCode) !== "0") {
    throw new Error("Swiggy rejected the search session. Refresh the normal browser session and confirm its location.");
  }
  return payload;
}

function moneyValue(value) {
  if (!value) return null;
  const units = Number(value.units || 0);
  const nanos = Number(value.nanos || 0);
  return units + nanos / 1e9;
}

function ratingCount(value) {
  if (!value) return null;
  const text = String(value).trim().toLowerCase();
  const match = text.match(/([\d.]+)\s*k/);
  if (match) return Math.round(Number(match[1]) * 1000);
  const numeric = Number(text.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function imageUrl(id) {
  if (!id || id.endsWith(".mp4")) return null;
  if (/^https?:\/\//.test(id)) return id;
  return `https://media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,h_600,w_600/${id}`;
}

function serviceSla(payload) {
  const configs = payload?.data?.configs?.IM_PAGE_CONFIGS?.configInfo || [];
  for (const config of configs) {
    const pods = config?.card?.podDetailsList || [];
    for (const pod of pods) {
      const sla = pod?.serviceabilityDetails?.sla;
      if (sla?.value && sla?.unit) return `${sla.value} ${sla.unit.toLowerCase()}`;
    }
  }
  return null;
}

function totalResults(payload) {
  const cards = payload?.data?.cards || [];
  for (const wrapper of cards) {
    const card = wrapper?.card?.card || wrapper?.card;
    if (typeof card?.resultCount === "number") return card.resultCount;
  }
  return null;
}

function extractItems(payload) {
  const cards = payload?.data?.cards || [];
  const items = [];
  for (const wrapper of cards) {
    const card = wrapper?.card?.card || wrapper?.card;
    const itemCards = card?.gridElements?.infoWithStyle?.items || [];
    for (const item of itemCards) items.push(item);
  }
  return items;
}

function pickVariation(item) {
  const variations = item?.variations || [];
  return (
    variations.find((variation) => variation.listingVariant && variation.inventory?.inStock) ||
    variations.find((variation) => variation.inventory?.inStock) ||
    variations.find((variation) => variation.listingVariant) ||
    variations[0] ||
    {}
  );
}

function normalizeProduct(item, query, sla) {
  const variation = pickVariation(item);
  const rating = variation.rating || {};
  const skuId = variation.skuId || "";
  const productId = item.productId || skuId;
  const available = Boolean(item.inStock && item.isAvail && variation.inventory?.inStock);

  return {
    id: productId,
    sku_id: skuId,
    name: variation.displayName || item.displayName || "",
    brand: variation.brandName || item.brand || "",
    available,
    images: (variation.medias || [])
      .map((media) => imageUrl(media.id || media.thumbnailId))
      .filter(Boolean),
    mrp: moneyValue(variation.price?.mrp),
    offer_price: moneyValue(variation.price?.offerPrice),
    quantity: variation.quantityDescription || "",
    deeplink: productId ? `${BASE_URL}/instamart/item/${encodeURIComponent(productId)}` : null,
    rating: rating.value ? Number(rating.value) : null,
    rating_count: ratingCount(rating.count),
    inventory: variation.cartAllowedQuantity?.allowedQuantity ?? null,
    platform: {
      name: "Swiggy Instamart",
      sla,
      open: available,
      icon: PLATFORM_ICON,
    },
  };
}

async function scrapeSwiggy(options) {
  options = resolveSwiggyOptions({ pages: 1, ...options });
  if (!options.cookie) {
    throw new Error("Swiggy requires browser cookies with location and aws-waf-token. Open swiggy_normal in Playwright CLI or set SWIGGY_COOKIE.");
  }
  validateLocation(options.cookie, options.lat, options.lon);

  const products = [];
  let total = null;
  let sla = null;
  let offset = 0;
  let resultsOffset = "0";

  for (let page = 1; page <= options.pages; page += 1) {
    const payload = await fetchSearchPage({
      query: options.query,
      offset,
      resultsOffset,
      cookie: options.cookie,
      deviceId: options.deviceId,
      matcher: options.matcher,
      buildVersion: options.buildVersion,
    });
    total ??= totalResults(payload);
    sla ??= serviceSla(payload);
    products.push(...extractItems(payload).map((item) => normalizeProduct(item, options.query, sla)));

    const cursor = payload?.data?.pageOffset?.nextOffset;
    const nextOffset = cursor == null || cursor === "" ? NaN : Number(cursor);
    if (!Number.isFinite(nextOffset) || nextOffset <= offset) break;
    offset = nextOffset;
    resultsOffset = String(payload?.data?.searchResultsOffset ?? "");
  }

  const seen = new Set();
  const uniqueProducts = products.filter((product) => {
    if (!product.id || seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });

  return {
    query: options.query,
    platform: "Swiggy Instamart",
    total_results: total || uniqueProducts.length,
    products: uniqueProducts,
  };
}

if (require.main === module) {
  scrapeSwiggy(parseArgs(process.argv.slice(2)))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { scrapeSwiggy, getAutomatedCookie, resolveSwiggyOptions, validateLocation };
