#!/usr/bin/env node
"use strict";

const { PrismaClient } = require("@prisma/client");
const webpush = require("web-push");
const { scrapeZepto } = require("../zepto_scraper.js");
const { scrapeBlinkit } = require("../blinkit_scraper.js");
const { scrapeFlipkart } = require("../flipkart_scraper.js");
const { scrapeSwiggy } = require("../swiggy_scraper.js");

const prisma = new PrismaClient();

const vendorScrapers = {
  ZEPTO: (alert) =>
    scrapeZepto({
      query: alert.query,
      lat: alert.lat,
      lon: alert.lon,
      pages: 1,
      ...(alert.vendorProductIds?.ZEPTO ? { productVariantId: alert.vendorProductIds.ZEPTO } : {}),
    }),
  BLINKIT: (alert) => scrapeBlinkit({ query: alert.query, lat: alert.lat, lon: alert.lon, pages: 1 }),
  FLIPKART: (alert) =>
    scrapeFlipkart({
      query: alert.query,
      pincode: alert.pincode,
      pages: 1,
      ...(alert.flipkartHyperlocalOnly ? { marketplace: "HYPERLOCAL", allowFallback: false } : {}),
    }),
  SWIGGY: (alert) =>
    scrapeSwiggy({
      query: alert.query,
      pages: 1,
      ...(process.env.SWIGGY_COOKIE ? { cookie: process.env.SWIGGY_COOKIE } : {}),
      ...(process.env.SWIGGY_DEVICE_ID ? { deviceId: process.env.SWIGGY_DEVICE_ID } : {}),
      ...(process.env.SWIGGY_MATCHER ? { matcher: process.env.SWIGGY_MATCHER } : {}),
    }),
};

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:alerts@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

function normalizeEnvelope(vendor, result) {
  const data = result && result.data ? result.data : result || {};
  return (data.products || []).map((product) => ({
    vendor,
    id: String(product.id || ""),
    name: product.name || "",
    brand: product.brand || "",
    quantity: product.quantity || "",
    price: Number(product.offer_price || product.offerPrice || 0),
    available: Boolean(product.available),
    link: product.deeplink || null,
  }));
}

function matchesAlert(alert, product) {
  const ids = alert.vendorProductIds || {};
  if (alert.scope === "LISTING") return ids[product.vendor] === product.id;
  const name = `${product.brand} ${product.name}`.toLowerCase();
  const target = `${alert.brand || ""} ${alert.productName}`.toLowerCase();
  const quantityOk = !alert.quantity || product.quantity.toLowerCase().includes(String(alert.quantity).toLowerCase());
  return quantityOk && target.split(/\s+/).filter(Boolean).some((token) => name.includes(token));
}

function evaluate(alert, products) {
  if (alert.ruleType === "BACK_IN_STOCK") {
    return products.find((product) => product.available && matchesAlert(alert, product)) || null;
  }
  const candidates = products.filter((product) => product.available && product.price > 0 && matchesAlert(alert, product));
  if (!candidates.length) return null;
  const lowest = candidates.reduce((best, product) => (product.price < best.price ? product : best), candidates[0]);
  if (alert.ruleType === "DROP_PERCENT") {
    const baseline = Number(alert.baselinePrice || 0);
    const drop = baseline > 0 ? ((baseline - lowest.price) / baseline) * 100 : 0;
    return drop >= Number(alert.dropPercent || 0) ? lowest : null;
  }
  return lowest.price <= Number(alert.targetPrice || 0) ? lowest : null;
}

function nextCheck(alert) {
  return new Date(Date.now() + alert.intervalMinutes * 60_000);
}

async function notify(alert, candidate, message) {
  let ntfyStatus = null;
  let pushStatus = null;
  let error = null;

  if (alert.ntfyUrl) {
    try {
      const response = await fetch(alert.ntfyUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Price alert",
          message,
          tags: "moneybag",
          click: candidate.link || undefined,
        }),
      });
      ntfyStatus = response.ok ? "SENT" : "FAILED";
      if (!response.ok) error = `ntfy HTTP ${response.status}`;
    } catch (err) {
      ntfyStatus = "FAILED";
      error = err.message;
    }
  }

  if (alert.browserPush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: alert.userId } });
    pushStatus = subscriptions.length ? "SENT" : "FAILED";
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({ title: "Price alert", body: message, url: candidate.link || "/" }),
        );
      } catch (err) {
        pushStatus = "FAILED";
        error = err.message;
      }
    }
  }

  return { ntfyStatus, pushStatus, error };
}

async function processAlert(alert) {
  const settled = await Promise.allSettled(alert.vendors.map((vendor) => vendorScrapers[vendor](alert)));
  const products = settled.flatMap((result, index) =>
    result.status === "fulfilled" ? normalizeEnvelope(alert.vendors[index], result.value) : [],
  );
  const candidate = evaluate(alert, products);
  let eventData = null;

  if (candidate) {
    const message =
      alert.ruleType === "BACK_IN_STOCK"
        ? `${alert.productName} is back in stock on ${candidate.vendor}.`
        : `${alert.productName} matched at Rs ${candidate.price} on ${candidate.vendor}.`;
    const delivery = await notify(alert, candidate, message);
    eventData = {
      alertId: alert.id,
      userId: alert.userId,
      matchedPrice: candidate.price || 0,
      previousPrice: alert.lastMatchedPrice,
      vendor: candidate.vendor,
      message,
      ntfyStatus: delivery.ntfyStatus,
      pushStatus: delivery.pushStatus,
      error: delivery.error,
    };
  }

  await prisma.$transaction([
    ...(eventData ? [prisma.alertEvent.create({ data: eventData })] : []),
    prisma.alert.update({
      where: { id: alert.id },
      data: {
        lastCheckedAt: new Date(),
        lastMatchedPrice: candidate ? candidate.price : alert.lastMatchedPrice,
        baselinePrice: alert.baselinePrice || (candidate ? candidate.price : undefined),
        nextCheckAt: nextCheck(alert),
      },
    }),
  ]);
}

async function tick() {
  const due = await prisma.alert.findMany({
    where: { active: true, nextCheckAt: { lte: new Date() } },
    orderBy: { nextCheckAt: "asc" },
    take: Number(process.env.ALERT_WORKER_BATCH || 10),
  });
  for (const alert of due) {
    try {
      await processAlert(alert);
    } catch (err) {
      console.error(`Alert ${alert.id} failed`, err);
      await prisma.alert.update({
        where: { id: alert.id },
        data: { lastCheckedAt: new Date(), nextCheckAt: nextCheck(alert) },
      });
    }
  }
  return due.length;
}

async function main() {
  console.log("Alert worker started");
  while (true) {
    const count = await tick();
    if (process.env.ALERT_WORKER_ONCE === "1") break;
    await new Promise((resolve) => setTimeout(resolve, count ? 5000 : 30000));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.ALERT_WORKER_ONCE === "1") await prisma.$disconnect();
  });
