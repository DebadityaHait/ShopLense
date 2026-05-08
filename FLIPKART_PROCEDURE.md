# Flipkart Scraper Build Procedure

This document records how `flipkart_scraper.js` was built, which tools were used, how the Flipkart endpoint was found, and how to run the script.

## Goal

Build a separate lightweight scraper for Flipkart search results from:

```text
https://www.flipkart.com/search?q=chicken&otracker=search&otracker1=search&marketplace=HYPERLOCAL&as-show=on&as=off&pageUID=1778152481536
```

Target pincode:

```text
603203
```

Output target:

- Same normalized product shape used by the Zepto and Blinkit scrapers.
- Direct Flipkart API calls.
- No per-product detail calls by default.
- No wrapper fields such as `status`, `request_id`, or `credits_remaining`.

## Files Created

```text
flipkart_scraper.js
FLIPKART_PROCEDURE.md
flipkart_output.json
```

## Tools Used

### `playwright-cli`

Used to open Flipkart in a visible browser, set the pincode flow, and inspect network requests.

Commands used:

```powershell
playwright-cli -s=flipkart open --browser=chrome "https://www.flipkart.com/search?q=chicken&otracker=search&otracker1=search&marketplace=HYPERLOCAL&as-show=on&as=off&pageUID=1778152481536"
playwright-cli -s=flipkart requests
playwright-cli -s=flipkart request 172
playwright-cli -s=flipkart request-body 172
```

The browser redirected the `marketplace=HYPERLOCAL` URL to Flipkart's Hyperlocal preview/address gate. The pincode `603203` was selected through the visible browser flow, but the Hyperlocal search URL still returned the address-gate redirect instead of product cards.

### Node.js

Used for direct API probing, JSON inspection, and the final script. The final script uses only Node.js built-ins:

- `fetch`
- `crypto`
- standard JSON parsing

No npm package was added.

### `rg`

Used to inspect saved JSON responses and locate fields such as:

- `PRODUCT_SUMMARY`
- `FILTER_SORT_OPTIONS`
- `PAGINATION_BAR`
- `paginationContextMap`
- `totalProducts`

## External References

No existing scraper repository was used as an implementation reference.

The request shape came from Flipkart's own browser network requests captured with `playwright-cli`.

## Endpoint Found

The product-list endpoint is:

```text
POST https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false
```

Important request fields:

```json
{
  "pageUri": "/search?q=chicken&otracker=search&otracker1=search&as-show=on&as=off",
  "pageContext": {
    "trackingContext": {
      "context": {
        "eVar51": "direct_browse",
        "eVar61": "direct_browse"
      }
    },
    "fetchSeoData": true,
    "networkSpeed": 10000
  },
  "requestContext": {
    "type": "BROWSE_PAGE",
    "ssid": "...",
    "sqid": "..."
  },
  "locationContext": {
    "pincode": 603203,
    "changed": false
  }
}
```

For pages after page 1, Flipkart requires `pageContext.paginationContextMap` from the previous response. Supplying only `page=2` in `pageUri` repeats page 1.

## Hyperlocal Caveat

The user-provided URL contains:

```text
marketplace=HYPERLOCAL
```

In the captured browser session, that request returned a redirect object for Flipkart's Hyperlocal preview/address gate. It did not return product cards.

The script therefore tries `HYPERLOCAL` first and, if Flipkart returns the location-gate redirect, falls back to regular Flipkart search while still sending:

```json
{
  "pincode": 603203
}
```

Use `--no-fallback` if you want to observe the Hyperlocal-only behavior.

## Data Kept

The script keeps:

- product id
- name
- brand
- availability
- image URLs
- MRP
- offer price
- quantity/subtitle
- product deeplink
- rating
- rating count
- delivery text, when present
- platform metadata

## Data Dropped

The API response contains many fields that are intentionally not included in the normalized output:

- SEO schema
- tracking context
- impression IDs
- pagination internals
- filter metadata
- category trees
- review snippets
- rating histograms
- analytics event fields
- session tokens
- layout/widget metadata

`inventory` is returned as `null` because the Flipkart search response exposes low-stock display text such as "Only 5 left" on the rendered page, but does not consistently expose a clean stock count in the normalized product card object.

## How To Use

Default run:

```powershell
node .\flipkart_scraper.js --query chicken --pincode 603203
```

Write output to a file:

```powershell
node .\flipkart_scraper.js --query chicken --pincode 603203 > flipkart_output.json
```

Fetch more pages:

```powershell
node .\flipkart_scraper.js --query chicken --pincode 603203 --pages 2
```

Try a specific marketplace:

```powershell
node .\flipkart_scraper.js --query chicken --pincode 603203 --marketplace GROCERY
```

Disable fallback from Hyperlocal to regular search:

```powershell
node .\flipkart_scraper.js --query chicken --pincode 603203 --marketplace HYPERLOCAL --no-fallback
```

## Verification

Commands run:

```powershell
node --check .\flipkart_scraper.js
node .\flipkart_scraper.js --query chicken --pincode 603203 > flipkart_output.json
node .\flipkart_scraper.js --query chicken --pincode 603203 --pages 2 > flipkart_output_pages2.tmp.json
```

Observed results:

- One default request returned 40 normalized products.
- Two pages returned 77 unique normalized products after product-id deduplication.
- Total results reported by Flipkart for the regular search response were `14657`.
