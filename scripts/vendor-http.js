"use strict";

async function readVendorJson(response, label) {
  const text = await response.text();
  const context = `HTTP ${response.status}, ${response.headers.get("content-type") || "unknown content type"}`;
  if (!response.ok) throw new Error(`${label} failed: ${context}. Upstream rejected the request.`);
  if (!text.trim()) throw new Error(`${label} failed: ${context}, empty response. No catalog data was returned.`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} failed: ${context}, non-JSON response. The upstream endpoint may have changed or returned a challenge.`);
  }
}

module.exports = { readVendorJson };
