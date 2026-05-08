#!/usr/bin/env node
"use strict";

const crypto = require("crypto");

const BASE_URL = "https://blinkit.com";
const SEARCH_PATH = "/v1/layout/search";
const APP_VERSION = "52434332";
const PLATFORM_ICON = "https://d2chhaxkq6tvay.cloudfront.net/platforms/blinkit.webp";

function parseArgs(argv) {
  const args = {
    query: "chicken",
    lat: 12.817127,
    lon: 80.04044,
    pages: 1,
    size: 20,
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
    } else if (arg === "--size") {
      args.size = Math.max(1, Number(next) || 20);
      i += 1;
    }
  }

  if (!args.query || !Number.isFinite(args.lat) || !Number.isFinite(args.lon)) {
    throw new Error("Usage: node blinkit_scraper.js --query chicken --lat 12.817127 --lon 80.04044");
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

function textValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return value.text || "";
}

function numberFromText(value) {
  if (typeof value === "number") return value;
  const text = textValue(value);
  if (!text) return null;
  const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function ratingCount(value) {
  const count = numberFromText(value);
  return Number.isFinite(count) ? count : null;
}

function productSnippets(payload) {
  const snippets = payload?.response?.snippets;
  if (!Array.isArray(snippets)) return [];
  return snippets.filter((snippet) => snippet?.widget_type === "product_card_snippet_type_2");
}

function imageUrls(data) {
  const mediaItems = data?.media_container?.items;
  if (Array.isArray(mediaItems)) {
    const images = mediaItems
      .map((item) => item?.image?.url)
      .filter(Boolean);
    if (images.length) return [...new Set(images)];
  }
  return data?.image?.url ? [data.image.url] : [];
}

function cartItem(data) {
  return (
    data?.atc_action?.add_to_cart?.cart_item ||
    data?.stepper_data_v2?.increment_actions?.default?.[0]?.add_to_cart?.cart_item ||
    {}
  );
}

function deeplink(data, id) {
  const raw = data?.click_action?.blinkit_deeplink?.url || "";
  const merchantId = raw.match(/[?&]merchant_id=([^&]+)/)?.[1] || data?.merchant_id || data?.meta?.merchant_id;
  const productId = id || raw.match(/[?&]product_id=([^&]+)/)?.[1] || data?.product_id;
  if (!productId) return null;
  const params = merchantId ? `?merchant_id=${encodeURIComponent(merchantId)}` : "";
  return `${BASE_URL}/prn/x/prid/${productId}${params}`;
}

function slaFromProduct(data) {
  const url = data?.eta_tag?.image?.url || data?.product_badges?.find((badge) => badge.type === "ETA")?.image_data?.url || "";
  const match = url.match(/(\d+)-mins/i);
  return match ? `${match[1]} mins` : textValue(data?.eta_tag?.title) || null;
}

function normalizeProduct(snippet) {
  const data = snippet?.data || {};
  const item = cartItem(data);
  const id = String(data.product_id || data.identity?.id || data.meta?.product_id || item.product_id || "");
  const available = data.product_state ? data.product_state === "available" : !data.is_sold_out && data.inventory !== 0;
  const rating = data?.rating?.bar || {};
  const brand = item.brand || textValue(data.brand_name);

  return {
    id,
    name: item.product_name || textValue(data.display_name) || textValue(data.name),
    brand,
    available,
    images: imageUrls(data),
    mrp: item.mrp ?? numberFromText(data.mrp),
    offer_price: item.price ?? numberFromText(data.normal_price),
    quantity: item.unit || textValue(data.variant),
    deeplink: deeplink(data, id),
    rating: typeof rating.value === "number" ? Number(rating.value.toFixed(1)) : null,
    rating_count: ratingCount(rating.title),
    inventory: item.inventory ?? data.inventory ?? null,
    platform: {
      name: "Blinkit",
      sla: slaFromProduct(data),
      open: available,
      icon: PLATFORM_ICON,
    },
  };
}

async function fetchSearch({ url, query, lat, lon, size, postbackParams, cookie }) {
  const fullUrl = url
    ? new URL(url, BASE_URL)
    : new URL(`${SEARCH_PATH}?q=${encodeURIComponent(query)}&start=0&size=${size}`, BASE_URL);
  const body = postbackParams ? JSON.stringify(postbackParams) : "{}";

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      app_client: "consumer_web",
      app_version: APP_VERSION,
      lat: String(lat),
      lon: String(lon),
      origin: BASE_URL,
      referer: `${BASE_URL}/s/?q=${encodeURIComponent(query)}`,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      ...(cookie ? { cookie } : {}),
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Blinkit search failed: HTTP ${response.status} ${text}`);
  }

  const nextCookie = response.headers.get("set-cookie") || "";
  return { payload: JSON.parse(text), cookie: nextCookie };
}

async function scrapeBlinkit(options) {
  let nextUrl = null;
  let postbackParams = null;
  let cookie = `gr_1_deviceId=${uuidLike(`${options.lat}:${options.lon}:${options.query}`)}`;
  const products = [];
  let totalResults = 0;

  for (let page = 0; page < options.pages; page += 1) {
    const { payload, cookie: responseCookie } = await fetchSearch({
      url: nextUrl,
      query: options.query,
      lat: options.lat,
      lon: options.lon,
      size: options.size,
      postbackParams,
      cookie,
    });

    if (responseCookie) {
      cookie = responseCookie
        .split(",")
        .map((part) => part.split(";")[0])
        .join("; ");
    }

    products.push(...productSnippets(payload).map(normalizeProduct));
    totalResults =
      payload?.postback_params?.postback_meta?.pageMeta?.scrollMeta?.[0]?.entitiesCount ||
      payload?.response?.pagination?.total_pagination_items ||
      totalResults;
    nextUrl = payload?.response?.pagination?.next_url || null;
    postbackParams = payload?.postback_params || null;
    if (!nextUrl) break;
  }

  const seen = new Set();
  const uniqueProducts = products.filter((product) => {
    if (!product.id || seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });

  return {
    query: options.query,
    platform: "Blinkit",
    lat: options.lat,
    lon: options.lon,
    total_results: totalResults || uniqueProducts.length,
    products: uniqueProducts,
  };
}

if (require.main === module) {
  scrapeBlinkit(parseArgs(process.argv.slice(2)))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { scrapeBlinkit };
