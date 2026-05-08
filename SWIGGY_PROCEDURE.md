# Swiggy Instamart Scraper Build Procedure

This document records how `swiggy_scraper.js` was built, which tools were used, and how to run it.

## Goal

Build a separate lightweight scraper for:

```text
https://www.swiggy.com/instamart/search?custom_back=true&query=chicken
```

Output target:

- Same normalized product shape used by the other scraper scripts.
- Direct Swiggy Instamart API call.
- No per-product detail calls by default.

## Files Created

```text
swiggy_scraper.js
SWIGGY_PROCEDURE.md
swiggy_output.json
```

## Tools Used

### `playwright-cli`

Used to open Swiggy Instamart in a visible browser, set the delivery location, and inspect network requests.

Commands used:

```powershell
playwright-cli -s=swiggy open --browser=chrome "https://www.swiggy.com/instamart/search?custom_back=true&query=chicken"
playwright-cli -s=swiggy requests
playwright-cli -s=swiggy request 101
playwright-cli -s=swiggy request-body 101
```

The first browser request showed the endpoint and body, but Swiggy returned an empty response with:

```text
x-rate-limit: SignalAutomatedBrowser
```

After setting location to pincode `603203`, the search request still needed Swiggy's browser cookies, especially signed location cookies and `aws-waf-token`.

### Node.js

Used for direct API probing, response inspection, and the final script.

The final script uses only Node.js built-ins:

- `fetch`
- `crypto`
- standard JSON parsing

No npm package was added.

### `rg`

Used to inspect saved response JSON for product fields such as:

- `ItemCollectionCard`
- `variations`
- `price`
- `inventory`
- `rating`
- `resultCount`
- `podDetailsList`

## Endpoint Found

The product-list endpoint is:

```text
POST https://www.swiggy.com/api/instamart/search/v2?offset=0&ageConsent=false&voiceSearchTrackingId=&storeId=&primaryStoreId=&secondaryStoreId=
```

Request body:

```json
{
  "facets": [],
  "sortAttribute": "",
  "query": "chicken",
  "search_results_offset": "0",
  "page_type": "INSTAMART_SEARCH_PAGE",
  "is_pre_search_tag": false
}
```

Useful headers:

```text
content-type: application/json
x-build-version: 2.341.0
x-device-id: <device id from cookie>
matcher: <optional matcher value copied from browser request>
cookie: <Swiggy browser cookies>
```

## Cookie Requirement

Unlike Zepto, Blinkit, and Flipkart, this endpoint is protected by AWS WAF and signed Swiggy location cookies.

The script therefore requires a cookie string from a real browser session that contains at least:

- `deviceId`
- `lat`
- `lng`
- `address`
- `userLocation`
- `aws-waf-token`

In the tested browser session, the visible page request was still blocked because Playwright used a `HeadlessChrome` user agent. Calling the API directly from Node with the browser cookies and a normal Chrome user agent returned product JSON.

## Data Kept

The script keeps:

- SKU id
- name
- brand
- availability
- image URLs
- MRP
- offer price
- quantity
- search deeplink with `itemId`
- rating
- rating count
- allowed cart quantity as `inventory`
- platform metadata and SLA

## Data Dropped

The API response contains fields that are not included in the normalized output:

- filters and sort configs
- analytics contexts
- widget layout metadata
- offer panels and callouts
- dimensions and weight internals
- cart constraints
- WAF/session data
- serviceability config beyond SLA
- alternate non-listing variants

## How To Use

Open Swiggy Instamart in a browser, set the delivery location, then copy the cookie string for `www.swiggy.com`.

Run:

```powershell
$env:SWIGGY_COOKIE = "deviceId=...; lat=...; lng=...; address=...; userLocation=...; aws-waf-token=..."
node .\swiggy_scraper.js --query chicken
```

If the browser request has a `matcher` header, pass it too:

```powershell
$env:SWIGGY_MATCHER = "bd7e88eef8cbbb9dfcc7eb7"
node .\swiggy_scraper.js --query chicken
```

Write output:

```powershell
cmd /c "node swiggy_scraper.js --query chicken > swiggy_output.json"
```

Fetch more pages:

```powershell
node .\swiggy_scraper.js --query chicken --pages 2
```

## Verification

Commands run:

```powershell
node --check .\swiggy_scraper.js
node .\swiggy_scraper.js --query chicken > swiggy_output.json
```

Observed result for the tested `603203` session:

- `total_results`: `129`
- first request product count: `33`
- first product: `TenderCuts Chicken Curry cut Skinless`
