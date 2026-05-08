# Zepto Scraper Build Procedure

This document records how `zepto_scraper.js` was built, which tools were used, and what external references were used.

## Goal

Build a lightweight scraper that searches Zepto directly through its API for:

- Query: `chicken`
- Latitude: `12.817127`
- Longitude: `80.040440`
- Output shape: normalized JSON with product id, name, brand, price, quantity, rating, inventory, images, deeplink, and platform metadata.

## Tools Used

### `playwright-cli`

Used because the task explicitly required opening a visible browser and inspecting Zepto network behavior.

Commands used:

```powershell
playwright-cli -s=zepto open --browser=chrome https://www.zepto.com/search?query=chicken
playwright-cli -s=zepto run-code "async page => { await page.context().grantPermissions(['geolocation'], { origin: 'https://www.zepto.com' }); await page.context().setGeolocation({ latitude: 12.817127, longitude: 80.040440 }); await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000); return { url: page.url(), title: await page.title() }; }"
playwright-cli -s=zepto requests
playwright-cli -s=zepto request 1
playwright-cli -s=zepto snapshot --depth=3
playwright-cli close-all
```

Result:

- `https://www.zepto.com/search?query=chicken` returned HTTP `429`.
- `https://www.zeptonow.com/search?query=chicken` also returned HTTP `429` in the browser session.
- The browser request log showed only the blocked document request, so the API endpoint had to be recovered from Zepto’s web assets instead of from a successful browser XHR log.

### PowerShell

Used for local file inspection, HTTP probing, and checking generated output.

Examples:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'https://www.zeptonow.com/search?query=chicken'
rg "api|search|store|catalog|v3|x-latitude|latitude|longitude|cdn.bff" .tmp
node .\zepto_scraper.js --query chicken --lat 12.817127 --lon 80.040440 --pages 1 > zepto_output.json
Get-Content -LiteralPath zepto_output.json -TotalCount 80
node --check .\zepto_scraper.js
```

### `rg`

Used to search downloaded Zepto JavaScript chunks for API constants and request-building code.

Important discoveries:

- Search endpoint constant:
  `user-search-service/api/v3/search`
- Zepto BFF base URL:
  `https://bff-gateway.zeptonow.com/`
- Store headers expected by the request:
  `storeId`, `store_id`, `store_ids`, `store_etas`
- Request-signing fields:
  `body`, `deviceId`, `method`, `requestId`, `secret`, `url`

### Node.js

Used for the final scraper because it is lightweight and has built-in `fetch` and `crypto` support.

No npm packages were added.

## External References

No existing scraper repository was used as implementation reference.

I briefly used web search for public Zepto API references, but the search results were not used as source code or relied on for the final implementation. The working endpoint and request format came from Zepto’s own current web JavaScript assets downloaded from:

```text
https://cdn.zeptonow.com/web-static-assets-prod/artifacts/15.18.2/_next/static/chunks/...
```

Those temporary chunks were only used for inspection and were deleted after implementation.

## Discovery Steps

### 1. Browser Load Attempt

The requested Zepto search URL was opened with `playwright-cli`:

```text
https://www.zepto.com/search?query=chicken
```

Geolocation was set to:

```json
{
  "latitude": 12.817127,
  "longitude": 80.040440
}
```

The site returned HTTP `429`, so no usable XHR requests appeared in the Playwright request log.

### 2. Static Asset Inspection

The Zepto page HTML was fetched with `Invoke-WebRequest`. The script URLs were extracted from the HTML, especially chunks under:

```text
https://cdn.zeptonow.com/web-static-assets-prod/artifacts/15.18.2/_next/static/chunks/
```

Searching those chunks showed:

```js
SEARCH: "user-search-service/api/v3/search"
```

and:

```js
NEXT_PUBLIC_ZEPTONOW_CF_BFF_URL || "https://bff-gateway.zeptonow.com/"
```

So the direct endpoint became:

```text
POST https://bff-gateway.zeptonow.com/user-search-service/api/v3/search
```

### 3. Request Signature Recovery

The Zepto web client signs requests before sending them.

The relevant logic builds a sorted pipe-delimited payload from:

```text
body
deviceId
method
requestId
secret
url
```

Then it computes:

```text
request-signature = sha256(payload)
x-timezone = sha256(request-signature)
```

For search, `secret` can be an empty string.

### 4. Header Recovery

The API returned `400 invalid request` until store headers were included.

The working required headers include:

```text
requestId
request_id
deviceId
device_id
sessionId
session_id
appVersion
app_version
platform
source
auth_revamp_flow
X-WITHOUT-BEARER
request-signature
x-timezone
storeId
store_id
store_ids
store_etas
origin
referer
user-agent
```

The location values are also sent as:

```text
x-latitude
x-longitude
```

The store used by the script is:

```text
b4dc8d65-ed2e-4142-81b6-373982b13500
```

This is Zepto’s sample/default store id observed in the web client. It can be overridden with:

```powershell
$env:ZEPTO_STORE_ID = "your-store-id"
```

### 5. API Validation

The first successful API request returned a Zepto layout response with:

```json
{
  "pageProductCount": 30,
  "totalProductCount": 212,
  "currentPage": 0,
  "hasReachedEnd": false
}
```

The response also included product widgets with nested product cards under:

```text
layout[].data.resolver.data.items[].productResponse
```

## Implementation Summary

File created:

```text
zepto_scraper.js
```

The script:

1. Parses CLI flags for `query`, `lat`, `lon`, `pages`, and `request-id`.
2. Generates deterministic UUID-like `deviceId` and `sessionId`.
3. Builds the request body:

   ```json
   {
     "query": "chicken",
     "pageNumber": 0,
     "mode": "SHOW_ALL_RESULTS"
   }
   ```

4. Generates Zepto-compatible request signatures.
5. Calls:

   ```text
   POST https://bff-gateway.zeptonow.com/user-search-service/api/v3/search
   ```

6. Extracts products from Zepto layout widgets.
7. Normalizes product cards into the requested shape.

## Verification

Syntax check:

```powershell
node --check .\zepto_scraper.js
```

Run:

```powershell
node .\zepto_scraper.js --query chicken --lat 12.817127 --lon 80.040440 --pages 1 > zepto_output.json
```

Observed result:

- Script exited successfully.
- `zepto_output.json` was created.
- Page 1 returned `30` normalized products.
- Zepto reported `total_results: 200` in the normalized response.

## Notes

- The visible browser path was blocked by Zepto/CloudFront with HTTP `429`.
- The final scraper does not use Playwright at runtime.
- The final scraper does not use third-party API providers.
- The script uses only Node.js built-ins.
