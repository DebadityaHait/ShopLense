#!/usr/bin/env node
"use strict";

const crypto = require("crypto");

const SEARCH_URL =
  "https://bff-gateway.zeptonow.com/user-search-service/api/v3/search";
const SERVICEABILITY_URL =
  "https://bff-gateway.zeptonow.com/serviceability-service/api/v1/serviceability";
const SEARCH_PATH = "/user-search-service/api/v3/search";
const SERVICEABILITY_PATH = "/serviceability-service/api/v1/serviceability";
const PRODUCT_DETAIL_PATH = "/product-assortment-service/api/v2/product-detail";
const PLATFORM_ICON = "https://d2chhaxkq6tvay.cloudfront.net/platforms/zepto.webp";
const CDN_BASE = "https://cdn.zeptonow.com/production///";

const DEFAULT_STORE_ID =
  process.env.ZEPTO_STORE_ID || "b4dc8d65-ed2e-4142-81b6-373982b13500";
const APP_VERSION = "15.18.2";
const storeCache = new Map();

function parseArgs(argv) {
  const args = {
    query: "chicken",
    lat: 12.817127,
    lon: 80.04044,
    pages: 1,
    requestId: "75551a71-0810-4f18-a7e4-d13e0c40c73e",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--query" || arg === "-q") {
      args.query = next;
      i += 1;
    } else if (arg === "--lat") {
      args.lat = Number(next);
      i += 1;
    } else if (arg === "--lon" || arg === "--lng") {
      args.lon = Number(next);
      i += 1;
    } else if (arg === "--pages") {
      args.pages = Math.max(1, Number(next) || 1);
      i += 1;
    } else if (arg === "--request-id") {
      args.requestId = next;
      i += 1;
    }
  }

  if (!args.query || !Number.isFinite(args.lat) || !Number.isFinite(args.lon)) {
    throw new Error("Usage: node zepto_scraper.js --query chicken --lat 12.817127 --lon 80.04044");
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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function signRequest({ method, path, requestId, deviceId, body, secret = "" }) {
  const parts = {
    body,
    deviceId,
    method: method.toLowerCase(),
    requestId,
    secret,
    url: path,
  };

  const payload = Object.keys(parts)
    .filter((key) => parts[key] !== undefined && parts[key] !== null)
    .sort()
    .map((key) => parts[key])
    .join("|");

  return sha256(payload);
}

function centsToRupees(value) {
  if (typeof value !== "number") return null;
  return Math.round(value) / 100;
}

function imageUrl(image) {
  if (!image?.path) return null;
  if (/^https?:\/\//i.test(image.path)) return image.path;
  return `${CDN_BASE}tr:w-400,ar-1600-1600,pr-true,f-auto,q-80/${image.path}`;
}

function quantity(productVariant) {
  if (productVariant?.formattedPacksize) return productVariant.formattedPacksize;
  if (productVariant?.packsize && productVariant?.unitOfMeasure) {
    return `${productVariant.packsize} ${String(productVariant.unitOfMeasure).toLowerCase()}`;
  }
  return "";
}

function productItems(payload) {
  const widgets = Array.isArray(payload?.layout) ? payload.layout : [];
  return widgets.flatMap((widget) => {
    const items = widget?.data?.resolver?.data?.items;
    return Array.isArray(items) ? items : [];
  });
}

function normalizeProduct(item) {
  const response = item?.productResponse ?? item;
  const product = response?.product ?? {};
  const variant = response?.productVariant ?? {};
  const id = variant.id || response.id || product.id || null;
  const inventory = response.availableQuantity ?? response.quantity ?? variant.quantity ?? null;
  const available = response.outOfStock === false && inventory !== 0 && variant.isActive !== false && response.isActive !== false;
  const images = (variant.images || []).map(imageUrl).filter(Boolean);
  const ratingSummary = variant.ratingSummary || response.ratingSummary || {};

  return {
    id,
    name: product.name || "",
    brand: product.brand || "",
    available,
    images,
    mrp: centsToRupees(response.mrp || variant.mrp),
    offer_price: centsToRupees(
      response.discountedSellingPrice || response.sellingPrice || response.superSaverSellingPrice
    ),
    quantity: quantity(variant),
    deeplink: id ? `https://www.zepto.com/pn/x/pvid/${id}` : null,
    rating: ratingSummary.averageRating ?? null,
    rating_count: ratingSummary.totalRatings ?? null,
    inventory,
    platform: {
      name: "Zepto",
      sla: "7 mins",
      open: available,
      icon: PLATFORM_ICON,
    },
  };
}

function normalizeProductDetail(payload, productVariantId) {
  const product = payload?.product || {};
  const storeProducts = Array.isArray(product.storeProducts) ? product.storeProducts : [];
  const storeProduct =
    storeProducts.find((item) => item?.productVariant?.id === productVariantId) ||
    storeProducts[0];
  if (!storeProduct) return null;
  return normalizeProduct({
    productResponse: {
      ...storeProduct,
      product,
      productVariant: storeProduct.productVariant,
    },
  });
}

async function resolveStore({ lat, lon, requestId, deviceId, sessionId }) {
  if (process.env.ZEPTO_STORE_ID) return process.env.ZEPTO_STORE_ID;
  const key = `${lat}:${lon}`;
  if (storeCache.has(key)) return storeCache.get(key);

  const query = `?lat=${encodeURIComponent(lat)}&long=${encodeURIComponent(lon)}`;
  const signature = signRequest({
    method: "get",
    path: SERVICEABILITY_PATH,
    requestId,
    deviceId,
    body: "",
  });

  const response = await fetch(`${SERVICEABILITY_URL}${query}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      requestId,
      request_id: requestId,
      deviceId,
      device_id: deviceId,
      sessionId,
      session_id: sessionId,
      appVersion: APP_VERSION,
      app_version: APP_VERSION,
      platform: "WEB",
      source: "DIRECT",
      auth_revamp_flow: "v2",
      "X-WITHOUT-BEARER": "true",
      "request-signature": signature,
      "x-timezone": sha256(signature),
      origin: "https://www.zepto.com",
      referer: "https://www.zepto.com/",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
  });

  if (!response.ok) {
    storeCache.set(key, DEFAULT_STORE_ID);
    return DEFAULT_STORE_ID;
  }

  const payload = await response.json();
  const primaryStore =
    payload?.data?.stores?.find((store) => store?.serviceable && store?.storeConstruct === "PRIMARY_STORE") ||
    payload?.data?.stores?.find((store) => store?.serviceable) ||
    payload?.data?.stores?.[0];
  const storeId = primaryStore?.storeId || DEFAULT_STORE_ID;
  storeCache.set(key, storeId);
  return storeId;
}

async function fetchPage({ query, pageNumber, requestId, deviceId, sessionId, lat, lon, storeId }) {
  const body = JSON.stringify({
    query,
    pageNumber,
    mode: "SHOW_ALL_RESULTS",
  });
  const signature = signRequest({
    method: "post",
    path: SEARCH_PATH,
    requestId,
    deviceId,
    body,
  });

  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    requestId,
    request_id: requestId,
    deviceId,
    device_id: deviceId,
    sessionId,
    session_id: sessionId,
    appVersion: APP_VERSION,
    app_version: APP_VERSION,
    platform: "WEB",
    source: "DIRECT",
    auth_revamp_flow: "v2",
    "X-WITHOUT-BEARER": "true",
    "request-signature": signature,
    "x-timezone": sha256(signature),
    storeId,
    store_id: storeId,
    store_ids: storeId,
    store_etas: `{"${storeId}":-1}`,
    "x-latitude": String(lat),
    "x-longitude": String(lon),
    origin: "https://www.zepto.com",
    referer: "https://www.zepto.com/",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };

  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zepto search failed: HTTP ${response.status} ${text}`);
  }

  return response.json();
}

async function fetchProductDetail({ productVariantId, requestId, deviceId, sessionId, storeId }) {
  const path = `${PRODUCT_DETAIL_PATH}?productVariantId=${encodeURIComponent(productVariantId)}&storeId=${encodeURIComponent(storeId)}`;
  const signature = signRequest({
    method: "get",
    path: PRODUCT_DETAIL_PATH,
    requestId,
    deviceId,
    body: "",
  });

  const response = await fetch(`https://bff-gateway.zeptonow.com${path}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      requestId,
      request_id: requestId,
      deviceId,
      device_id: deviceId,
      sessionId,
      session_id: sessionId,
      appVersion: APP_VERSION,
      app_version: APP_VERSION,
      platform: "WEB",
      source: "DIRECT",
      auth_revamp_flow: "v2",
      "X-WITHOUT-BEARER": "true",
      "request-signature": signature,
      "x-timezone": sha256(signature),
      storeId,
      store_id: storeId,
      store_ids: storeId,
      store_etas: `{"${storeId}":-1}`,
      origin: "https://www.zepto.com",
      referer: "https://www.zepto.com/",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
  });

  if (!response.ok) return null;
  const payload = await response.json();
  return normalizeProductDetail(payload, productVariantId);
}

function dedupeProducts(products) {
  const seen = new Set();
  return products.filter((product) => {
    const key = product.id || `${product.name}:${product.quantity}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function scrapeZepto(options) {
  const requestId = options.requestId || uuidLike(`${Date.now()}:request`);
  const deviceId = uuidLike(`${requestId}:device`);
  const sessionId = uuidLike(`${requestId}:session`);
  const storeId = options.storeId || await resolveStore({ lat: options.lat, lon: options.lon, requestId, deviceId, sessionId });
  const products = [];
  let totalResults = 0;

  for (let pageNumber = 0; pageNumber < options.pages; pageNumber += 1) {
    const payload = await fetchPage({
      query: options.query,
      pageNumber,
      requestId,
      deviceId,
      sessionId,
      lat: options.lat,
      lon: options.lon,
      storeId,
    });
    totalResults = payload?.meta?.total_results || payload?.totalProductCount || totalResults;
    products.push(...productItems(payload).map(normalizeProduct));
    if (payload?.hasReachedEnd) break;
  }

  if (options.productVariantId && !products.some((product) => product.id === options.productVariantId)) {
    const product = await fetchProductDetail({
      productVariantId: options.productVariantId,
      requestId,
      deviceId,
      sessionId,
      storeId,
    });
    if (product) products.unshift(product);
  }

  const uniqueProducts = dedupeProducts(products);

  return {
    status: "success",
    request_id: requestId,
    credits_remaining: 98,
    data: {
      query: options.query,
      platform: "Zepto",
      lat: options.lat,
      lon: options.lon,
      store_id: storeId,
      total_results: totalResults || uniqueProducts.length,
      products: uniqueProducts,
    },
  };
}

if (require.main === module) {
  scrapeZepto(parseArgs(process.argv.slice(2)))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { scrapeZepto, resolveStore, fetchProductDetail };
