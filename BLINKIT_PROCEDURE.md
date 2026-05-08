# Blinkit Scraper Build Procedure

This document records how `blinkit_scraper.js` was built, which tools were used, how the Blinkit endpoint was found, what data was kept or dropped, and how to run the script.

## Goal

Build a separate lightweight scraper for Blinkit search results from:

```text
https://blinkit.com/s/?q=chicken
```

Target location:

```json
{
  "lat": 12.817127,
  "lon": 80.040440
}
```

Output target:

- Same normalized product shape as the Zepto scraper.
- Direct Blinkit API calls, not a third-party quick-commerce API wrapper.
- No unnecessary wrapper fields such as `status`, `request_id`, or `credits_remaining`.
- One product-search request by default, with optional pagination only when requested.

## Files Created

```text
blinkit_scraper.js
BLINKIT_PROCEDURE.md
blinkit_output.json
```

## Tools Used

### `playwright-cli`

Used because the earlier Zepto workflow required a visible browser, and the same approach was first attempted for Blinkit.

Commands used:

```powershell
playwright-cli -s=blinkit open --browser=chrome https://blinkit.com/s/?q=chicken
playwright-cli -s=blinkit requests
```

Result:

- The visible Playwright browser hit a Blinkit `403` page.
- The request log showed only the blocked document request.
- No usable product API request was visible from that browser session.

Because of that, discovery continued with Blinkit's own HTML and JavaScript assets.

### `curl.exe`

Used to fetch Blinkit's page and first-party JavaScript bundles with a normal browser user agent.

Example:

```powershell
curl.exe -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" "https://blinkit.com/s/?q=chicken" -o blinkit_search.html
```

This returned the Blinkit HTML successfully, unlike the visible Playwright session.

### `rg`

Used to search downloaded Blinkit bundles for:

- search action names
- BFF layout endpoints
- product snippet types
- pagination keys
- postback keys
- app client and app version values

Examples:

```powershell
rg "fetchNewSearchQueryResults|fetchAutoSuggestResults|paginationURL|postbackParams" .tmp_blinkit -n
rg "product_card_snippet_type_2|/v1/layout/search|response.pagination|postback_params" .tmp_blinkit -n
```

### Node.js

Used for:

- quick one-off inspection of HTML and JSON
- parsing `window.grofers.PRELOADED_STATE`
- inspecting API response structure
- implementing the final scraper

The final script uses only Node.js built-ins:

- `fetch`
- `crypto`
- standard JSON parsing

No npm package was added.

## External References

No existing scraper repository was used as an implementation reference.

The endpoint and request shape came from Blinkit's own current web assets and direct endpoint testing.

Web search briefly showed third-party commercial API providers, but those were not used for implementation or as source-code references.

## Discovery Steps

### 1. Browser Load Attempt

The target page was opened with `playwright-cli`:

```powershell
playwright-cli -s=blinkit open --browser=chrome https://blinkit.com/s/?q=chicken
playwright-cli -s=blinkit requests
```

Observed request:

```text
GET https://blinkit.com/s/?q=chicken => 403
```

This meant the visible browser did not expose the real search API request.

### 2. HTML Fetch

The same URL was fetched with a browser user agent:

```powershell
curl.exe -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" "https://blinkit.com/s/?q=chicken" -o blinkit_search.html
```

The HTML contained:

```js
window.grofers.PRELOADED_STATE
window.grofers.CONFIG
```

Useful values found:

```text
app_client: consumer_web
app_version: 52434332
query: chicken
```

The preloaded state also had search metadata such as `postbackParams`, but it did not contain fully rendered product cards. The page was still in a loading/skeleton state.

### 3. First-Party Bundle Inspection

Blinkit's JavaScript chunks were downloaded from script tags in the HTML and searched locally.

Important findings:

```text
ui.search.searchProductBffData
fetchNewSearchQueryResults
fetchAutoSuggestResults
fetchNewPaginatedResults
product_card_snippet_type_2
response.pagination.next_url
postback_params
```

This showed that Blinkit search is served through a BFF layout API. The API does not return a plain product array; it returns renderable snippets, and product cards are embedded as `product_card_snippet_type_2`.

### 4. Endpoint Testing

Several likely endpoints were tested with `curl.exe`.

Non-working or irrelevant examples included:

```text
GET  /v1/layout/search?q=chicken&start=0&size=20       => 404
POST /v1/layout/search_widgets                         => 500 fallback error
GET  /v1/search/products?q=chicken&start=0&size=20      => 404
GET  /v6/search/products?q=chicken&start=0&size=20      => 404 HTML/error
GET  /v2/search/deeplink/?restricted=false&version=8... => 200 but collection-style response, not product search
```

The working product request was:

```http
POST https://blinkit.com/v1/layout/search?q=chicken&start=0&size=20
accept: application/json
content-type: application/json
app_client: consumer_web
app_version: 52434332
lat: 12.817127
lon: 80.040440
origin: https://blinkit.com
referer: https://blinkit.com/s/?q=chicken
user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36

{}
```

Response shape:

```json
{
  "is_success": true,
  "response": {
    "snippets": [],
    "layout_config": {},
    "pagination": {
      "next_url": "/v1/layout/search?offset=12&limit=12&..."
    },
    "tracking": {}
  },
  "postback_params": {}
}
```

### 5. Product Extraction

Products are not at `response.products`.

They are snippets:

```text
response.snippets[].widget_type === "product_card_snippet_type_2"
```

Each product card has data under:

```text
snippet.data
```

Useful fields found:

```text
data.product_id
data.name.text
data.display_name.text
data.brand_name.text
data.image.url
data.media_container.items[].image.url
data.mrp.text
data.normal_price.text
data.inventory
data.product_state
data.is_sold_out
data.rating.bar.value
data.rating.bar.title.text
data.atc_action.add_to_cart.cart_item
data.click_action.blinkit_deeplink.url
```

The add-to-cart object was especially useful because it contains clean product values:

```text
product_id
product_name
brand
price
mrp
unit
inventory
image_url
merchant_id
```

### 6. Pagination Confirmation

The first response includes:

```text
response.pagination.next_url
postback_params
```

The next request uses:

```http
POST https://blinkit.com{response.pagination.next_url}
body: {previous response postback_params}
```

This was tested successfully. One page returned `12` normalized products. Two pages returned `24` normalized products.

## Request-Minimization Decision

By default, `blinkit_scraper.js` makes one product-search API request.

It does not call autosuggest, PDP/detail APIs, recommendation APIs, cart APIs, or ETA APIs.

Extra requests happen only when the caller explicitly asks for pagination:

```powershell
node blinkit_scraper.js --query chicken --lat 12.817127 --lon 80.040440 --pages 2
```

This matters because the user specifically did not want to risk rate limiting for data that is not needed.

## Output Schema Decision

The output does not include:

```json
{
  "status": "success",
  "request_id": "...",
  "credits_remaining": 98
}
```

Those fields came from a third-party API response template, not from Blinkit's direct API, and are not necessary for the local scraper.

The final output shape is:

```json
{
  "query": "chicken",
  "platform": "Blinkit",
  "lat": 12.817127,
  "lon": 80.04044,
  "total_results": 185,
  "products": []
}
```

## Normalized Product Fields

Each product is normalized to:

```json
{
  "id": "690207",
  "name": "Abis Pro Chicken Curry Cut",
  "brand": "Abis Pro",
  "available": true,
  "images": [],
  "mrp": 155,
  "offer_price": 119,
  "quantity": "500 g",
  "deeplink": "https://blinkit.com/prn/x/prid/690207?merchant_id=44856",
  "rating": 3.4,
  "rating_count": 4204,
  "inventory": 6,
  "platform": {
    "name": "Blinkit",
    "sla": "15 mins",
    "open": true,
    "icon": "https://d2chhaxkq6tvay.cloudfront.net/platforms/blinkit.webp"
  }
}
```

## Additional API Data Dropped

The Blinkit API returns a lot of UI and tracking data that is not in the requested schema.

Dropped fields include:

- snippet layout config
- page-level components
- subscribers
- analytics tracking maps
- impression maps
- click maps
- add-to-cart action definitions after extracting product values
- remove-from-cart action definitions
- recommendation action payloads
- product badges and overlay badge rendering data
- merchant type
- group id
- variant dropdown rendering metadata
- raw BFF deeplink
- raw postback metadata
- raw pagination URLs
- autosuggest snippets

Some dropped data is used internally only when it helps normalize a requested field. For example:

- `atc_action.add_to_cart.cart_item` is used to get clean price, MRP, brand, unit, and inventory.
- `click_action.blinkit_deeplink.url` is used to derive a browser deeplink.
- `eta_tag.image.url` is used to infer SLA such as `15 mins`.

## Script Design

File:

```text
blinkit_scraper.js
```

Main functions:

```text
parseArgs()
fetchSearch()
productSnippets()
normalizeProduct()
scrapeBlinkit()
```

Design choices:

- Keep it dependency-free.
- Keep CLI usage similar to `zepto_scraper.js`.
- Default to the user's requested `chicken` query and coordinates.
- Generate a stable `gr_1_deviceId`-style cookie from query and coordinates.
- Deduplicate products by product id.
- Support optional pagination through `--pages`.
- Keep the final JSON clean and schema-focused.

## Usage

Default run:

```powershell
node blinkit_scraper.js
```

Explicit query and location:

```powershell
node blinkit_scraper.js --query chicken --lat 12.817127 --lon 80.040440
```

Write output to a file from `cmd.exe`:

```powershell
cmd /c "node blinkit_scraper.js --query chicken --lat 12.817127 --lon 80.040440 > blinkit_output.json"
```

PowerShell's `>` can write UTF-16 in some configurations, which is why `cmd /c` was used during verification to create a UTF-8-compatible JSON file.

Fetch two pages:

```powershell
node blinkit_scraper.js --query chicken --lat 12.817127 --lon 80.040440 --pages 2
```

Change requested page size:

```powershell
node blinkit_scraper.js --query chicken --lat 12.817127 --lon 80.040440 --size 12
```

Import from another Node script:

```js
const { scrapeBlinkit } = require("./blinkit_scraper");

scrapeBlinkit({
  query: "chicken",
  lat: 12.817127,
  lon: 80.04044,
  pages: 1,
  size: 20,
}).then(console.log);
```

## Verification

Default run:

```powershell
cmd /c "node blinkit_scraper.js --query chicken --lat 12.817127 --lon 80.040440 > blinkit_output.json"
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('blinkit_output.json','utf8')); console.log(p.products.length, p.products[0].name, p.products[0].platform.sla)"
```

Observed:

```text
12 Abis Pro Chicken Curry Cut 15 mins
```

Pagination check:

```powershell
node -e "const {scrapeBlinkit}=require('./blinkit_scraper'); scrapeBlinkit({query:'chicken', lat:12.817127, lon:80.04044, pages:2, size:20}).then(p=>console.log(JSON.stringify({total_results:p.total_results,count:p.products.length,last:p.products.at(-1)?.name}, null, 2)))"
```

Observed:

```json
{
  "total_results": 185,
  "count": 24,
  "last": "Aachi Chicken Masala"
}
```

## Notes

- The visible Playwright browser path was blocked by Blinkit with HTTP `403`.
- The final scraper does not use Playwright at runtime.
- The final scraper does not use a third-party API provider.
- The script uses one product-search request by default.
- `total_results` comes from Blinkit's search postback metadata when available.
- Results, availability, prices, inventory, SLA, and ratings are location-dependent and can change over time.
