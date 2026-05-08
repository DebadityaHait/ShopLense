# ShopLense Project Documentation

## Overview

ShopLense is a full-stack local commerce comparison product. It began as standalone scraper scripts for individual vendors and was expanded into a Next.js dashboard with authentication, location controls, product grouping, exact out-of-stock trackers, price alerts, and a background worker.

The project has two major layers:

1. Vendor scraper layer: independent Node.js scripts that reproduce the marketplace web requests and normalize each vendor response.
2. Product application layer: a Next.js dashboard and API that orchestrates scrapers, groups products, manages users, stores alerts, and sends notifications.

## Product Name and UX

The product is named ShopLense.

The unauthenticated entry point is now a SaaS-style landing page with:

- product positioning
- quick feature cards
- sign in/register form
- shared guest access
- dark glass UI treatment

Authenticated users land directly in the operational dashboard.

## Repository Map

```text
.
├─ zepto_scraper.js
├─ blinkit_scraper.js
├─ flipkart_scraper.js
├─ swiggy_scraper.js
├─ scripts/
│  ├─ alert-worker.js
│  └─ swiggy-location-cookie.js
├─ src/
│  ├─ app/
│  │  ├─ api/search/route.ts
│  │  ├─ api/alerts/route.ts
│  │  ├─ api/auth/[...nextauth]/route.ts
│  │  ├─ api/auth/guest/route.ts
│  │  ├─ api/auth/register/route.ts
│  │  └─ api/push/subscribe/route.ts
│  ├─ components/
│  │  ├─ AuthPanel.tsx
│  │  ├─ Dashboard.tsx
│  │  └─ AlertsClient.tsx
│  └─ lib/
│     ├─ vendor-search.ts
│     ├─ product-normalization.ts
│     ├─ result-ranking.ts
│     ├─ alerts.ts
│     ├─ auth.ts
│     └─ prisma.ts
└─ prisma/
   ├─ schema.prisma
   └─ migrations/
```

## How The Scrapers Were Built From Scratch

The scrapers were built by observing the actual web applications rather than relying on public APIs. The general method was:

1. Open the vendor website in a browser.
2. Set a known test location.
3. Search a stable query such as `chicken`, `chicken breast`, or `cheese slices`.
4. Capture network requests with browser tooling and Playwright CLI.
5. Identify the request that returns product listing JSON.
6. Reproduce that request in Node.js with `fetch`.
7. Add the minimum required headers, cookies, request bodies, signatures, and location fields.
8. Normalize the vendor-specific response to a common product shape.
9. Add pagination where available.
10. Add out-of-stock and deeplink handling.
11. Save example outputs and procedure notes for each vendor.

The original procedure notes remain in the root docs:

- `PROCEDURE.md`
- `BLINKIT_PROCEDURE.md`
- `FLIPKART_PROCEDURE.md`
- `SWIGGY_PROCEDURE.md`
- `SWIGGY_COOKIE_MANUAL.md`

## Common Scraper Output Format

Each scraper returns products with fields that can be converted into `VendorProduct`:

```ts
{
  id: string;
  name: string;
  brand: string;
  available: boolean;
  images: string[];
  mrp: number | null;
  offer_price: number | null;
  quantity: string;
  deeplink: string | null;
  rating: number | null;
  rating_count: number | null;
  inventory: number | null;
  platform: {
    name: string;
    sla: string | null;
    open: boolean;
    icon: string;
  };
}
```

This format keeps the web app independent of each vendor's raw JSON structure.

## Zepto Scraper

File: `zepto_scraper.js`

### Discovery

Zepto search traffic was traced to BFF gateway endpoints:

- search: `/user-search-service/api/v3/search`
- serviceability: `/serviceability-service/api/v1/serviceability`
- product detail: `/product-assortment-service/api/v2/product-detail`

### Location

Zepto requires a store id for accurate availability. The scraper first resolves the store with:

```text
GET /serviceability-service/api/v1/serviceability?lat=<lat>&long=<lon>
```

It chooses a serviceable primary store where possible and falls back to a default store only if serviceability fails.

### Request Signing

Zepto web requests include a request signature. The scraper recreates the observed signature format by hashing sorted request components such as method, path, body, request id, and device id. It also sends matching web headers:

- `requestId`
- `deviceId`
- `sessionId`
- `appVersion`
- `storeId`
- `store_ids`
- `store_etas`
- `x-latitude`
- `x-longitude`

### Product Normalization

Zepto product data is nested under product response, product, and product variant structures. The scraper extracts:

- variant id
- product name
- brand
- pack size
- mrp and selling price
- image paths converted to CDN URLs
- inventory and `outOfStock`

### Out-of-stock Detail

Zepto search can omit unavailable products. For exact trackers, the scraper can call product-detail by `productVariantId` and prepend that product even when it is out of stock.

This is why Zepto has stronger exact out-of-stock tracking than the other vendors.

## Blinkit Scraper

File: `blinkit_scraper.js`

### Discovery

Blinkit web search was traced to:

```text
POST https://blinkit.com/v1/layout/search?q=<query>&start=0&size=<size>
```

The response contains UI snippets. Product cards are snippets where:

```text
widget_type === "product_card_snippet_type_2"
```

### Location

Blinkit accepts latitude and longitude through request headers:

- `lat`
- `lon`

The scraper creates a deterministic device cookie from lat/lon/query for repeatable local requests.

### Pagination

Blinkit returns pagination data:

- `response.pagination.next_url`
- `postback_params`

The scraper feeds those back into later requests.

### Product Normalization

The scraper extracts product fields from snippet data:

- product id from `product_id`, identity, meta, or cart item
- display name and brand
- cart item price and mrp
- unit/variant
- sold-out or product state
- inventory
- ETA badge for SLA
- Blinkit deeplink as `/prn/x/prid/<id>`

### Exact Tracking

Blinkit does not currently have an exact product-detail fallback in this app. If an exact tracker URL is provided and Blinkit search omits it, ShopLense inserts an unavailable placeholder. A back-in-stock alert later triggers when search returns that same id as available.

## Flipkart / Flipkart Minutes Scraper

File: `flipkart_scraper.js`

### Discovery

Flipkart search was traced to:

```text
POST https://1.rome.api.flipkart.com/api/4/page/fetch?cacheFirst=false
```

The request body uses:

- `pageUri`
- `pageContext`
- `requestContext`
- `locationContext`

### Location

Flipkart uses pincode:

```ts
locationContext: {
  pincode: Number(pincode),
  changed: false
}
```

### Hyperlocal / Minutes

The scraper defaults to:

```text
marketplace=HYPERLOCAL
```

This targets Flipkart Minutes/hyperlocal inventory. If Flipkart redirects or gates the hyperlocal page, the scraper can fall back to regular Flipkart.

The dashboard exposes `Minutes products only`. When enabled, the API passes:

```ts
{
  marketplace: "HYPERLOCAL",
  allowFallback: false
}
```

That prevents regular marketplace results from mixing into a Minutes-only scan or alert.

### Product Normalization

The scraper reads `PRODUCT_SUMMARY` slots and extracts:

- product id
- listing id
- title, subtitle, brand
- availability display state
- final price and mrp
- image templates expanded to concrete URLs
- rating and rating count
- delivery text
- product deeplink

### Exact Tracking

Flipkart exact tracker URLs are parsed by `pid`. If search omits the product, ShopLense inserts an unavailable placeholder. Restock detection happens when future search returns the same `pid` as available.

## Swiggy Instamart Scraper

File: `swiggy_scraper.js`

### Discovery

Swiggy Instamart search was traced to:

```text
POST https://www.swiggy.com/api/instamart/search/v2
```

The request body includes:

- `query`
- `search_results_offset`
- `page_type: "INSTAMART_SEARCH_PAGE"`
- facets and sort fields

### Cookies and Location

Swiggy is the most session-sensitive vendor. It relies on browser cookies with:

- selected delivery location
- device id
- anti-abuse/WAF state

The scraper can read cookies from:

- `SWIGGY_COOKIE`
- `swiggy_cookie.txt`
- Playwright CLI cookie extraction

### Playwright Location Helper

File: `scripts/swiggy-location-cookie.js`

Run:

```bash
npm run swiggy:location -- --lat 12.817127 --lon 80.04044 --pincode 603203 --query milk
```

The helper:

1. Opens a persistent Playwright CLI Chrome session.
2. Grants geolocation permission.
3. Sets geolocation to the requested lat/lon.
4. Opens Swiggy Instamart.
5. Lets the user confirm the address if Swiggy asks.
6. Captures cookies for `www.swiggy.com`.
7. Saves `swiggy_cookie.txt` and `swiggy_location.json`.

### Product Normalization

Swiggy returns product cards with variations. The scraper chooses the best variation in this order:

1. listing variant that is in stock
2. any in-stock variation
3. listing variant
4. first variation

It normalizes:

- Instamart product id as the product id
- SKU as `sku_id`
- display name
- brand
- quantity description
- price money objects
- rating count strings
- media ids to Swiggy image URLs
- item page deeplink as `/instamart/item/<productId>`

### Exact Tracking

Swiggy exact tracker URLs are parsed from `/instamart/item/<id>`. If search does not return that item, ShopLense inserts an unavailable placeholder. Restock triggers when future search returns it as available.

## Next.js Application Layer

### API Search

Route: `src/app/api/search/route.ts`

Responsibilities:

- validate input with zod
- parse exact tracker URLs into vendor product ids
- call `searchVendors`
- group products
- optionally persist search snapshots
- return grouped comparison results and per-vendor status

### Vendor Orchestration

File: `src/lib/vendor-search.ts`

Responsibilities:

- load CommonJS scraper modules from TypeScript
- run selected vendors concurrently
- enforce per-vendor timeout
- return partial success if one vendor fails
- normalize vendor envelopes
- append exact tracker placeholders
- pass Flipkart Minutes-only options
- pass Zepto exact product variant ids to product-detail

## Product Grouping

File: `src/lib/product-normalization.ts`

The grouping system:

- lowercases and normalizes text
- removes punctuation
- normalizes quantities such as kg to g and l to ml
- removes low-signal words
- compares cleaned name tokens with Jaccard similarity
- requires quantity compatibility
- checks brand compatibility when both brands exist

This was added because naive text grouping incorrectly merged products such as different cheese brands under one product group.

## Result Ranking

File: `src/lib/result-ranking.ts`

Ranking is client-side so users can change sorting instantly after a scan.

Controls include:

- relevance
- lowest price
- largest discount
- vendor spread
- must include search keywords

This helps searches such as `chicken breast` avoid being buried under loosely related marketplace results.

## Exact Product Trackers

Exact trackers live in their own dashboard tab to keep vendor selection short.

Input is vendor-specific:

- Zepto product URL or variant id
- Blinkit product URL or product id
- Flipkart product URL containing `pid`
- Swiggy Instamart item URL

If the product is missing from search, ShopLense creates a placeholder:

- `available: false`
- `inventory: 0`
- exact deeplink preserved

Users can create a `BACK_IN_STOCK` alert from that placeholder.

## Alerts

Tables:

- `Alert`
- `AlertEvent`
- `PushSubscription`

Rules:

- `PRICE_BELOW`
- `LOWEST_BELOW`
- `DROP_PERCENT`
- `BACK_IN_STOCK`

Alert scope:

- group
- listing

Flipkart Minutes-only is persisted on alerts as `flipkartHyperlocalOnly`, so scheduled checks do not later fall back to regular Flipkart.

## Worker

File: `scripts/alert-worker.js`

The worker:

1. loads due alerts
2. reruns selected vendor searches
3. preserves exact Zepto product-detail checks when applicable
4. preserves Flipkart Minutes-only checks
5. normalizes products
6. evaluates alert rules
7. sends notifications
8. records alert events
9. schedules the next check

## Notifications

### ntfy

The worker posts JSON to the user-provided ntfy URL with:

- title
- message
- tags
- click URL

### Browser Push

Browser push uses:

- service worker in `public/sw.js`
- Push API subscription
- VAPID public/private keys
- `web-push` package

## Authentication

Auth uses NextAuth credentials with bcrypt password hashes.

Account types:

- registered account
- shared guest account

The shared guest account is controlled by:

```env
SHOPLENSE_GUEST_EMAIL="guest@shoplense.local"
SHOPLENSE_GUEST_PASSWORD="shoplense-guest-access"
```

The guest endpoint upserts the same user every time. It does not create new guest rows on each login.

## Database

Database provider:

- Postgres/Neon through `DATABASE_URL`

Prisma models:

- `User`
- `SearchRun`
- `ProductSnapshot`
- `ProductGroup`
- `Alert`
- `AlertEvent`
- `PushSubscription`

Search snapshot persistence is controlled by:

```env
PERSIST_SEARCH_SNAPSHOTS="0"
```

When disabled, live searches do not write all search results to Neon.

## UI Design

ShopLense uses a dark SaaS dashboard style:

- glass panels
- restrained emerald accent
- sticky chrome header
- tabbed configuration
- separate tracker tab
- dense comparison results
- mobile-friendly single-column collapse

The landing page is not just a login box. It introduces the product, shows concrete capabilities, and still gives immediate access through guest mode.

## Testing

Run:

```bash
npm test
npx tsc --noEmit
npm run build
```

Coverage currently includes:

- grouping and normalization
- result ranking
- alert evaluation
- vendor partial-failure behavior
- exact tracker placeholders
- Flipkart Minutes-only options

## Operational Notes

- Refresh Swiggy cookies whenever Swiggy returns empty responses or WAF/session failures.
- Use `Minutes products only` when you want Flipkart hyperlocal inventory and no regular marketplace fallback.
- Use exact trackers only for specific items; normal searches should stay vendor-neutral.
- Use guest mode for demos only. Shared guest alerts and subscriptions are visible to anyone using the same guest account.
