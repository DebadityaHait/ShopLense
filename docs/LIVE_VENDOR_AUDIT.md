# Live vendor audit

**Latest result:** after establishing anonymous delivery-location sessions and
repairing the adapters, Swiggy, Blinkit, Zepto, and regular Flipkart all returned
live products. The initial results below are retained as the debugging baseline;
see the follow-up section for the repaired behavior. Flipkart Minutes still
returns a location gate in the tested direct-HTTP flow.

Verified on October 7, 2026 from the current development machine. These results
describe this environment, not a comparison between Indian and US networks.

## Results

Tests used `biscuits`, latitude `12.817127`, longitude `80.04044`, and pincode
`603203`, unless noted otherwise.

| Integration | Observed result | Login/session requirement |
| --- | --- | --- |
| Regular Flipkart | Repeated one-page requests returned 36-38 products. Two pages returned 76 unique biscuits products; a separate two-page milk query returned 78. | No vendor login or browser session was required. |
| Flipkart Minutes | Returned an address/location redirect rather than product cards. | Selecting a pincode in the request is insufficient in this tested flow. Account login has not been established as necessary. |
| Zepto | Serviceability returned HTTP 202, HTML content type, and an empty body. Search could not proceed. | No account credentials are used by this scraper. This failure does not establish an Indian-IP requirement or expired credentials. |
| Blinkit | Search returned HTTP 403 and HTML. | No account credentials are used by this scraper. The rejection's cause is not isolated. |
| Swiggy | Existing configured cookie values were empty. A fresh anonymous browser session obtained a WAF cookie, but location selection did not complete; a search using that session was rejected. | A valid browser session with a selected location is needed. Public location selection is offered separately from account login. |

No customer account was accessed, no OTP was requested, and no challenge was bypassed.
Cookie values and upstream response bodies are excluded from the reported summaries.

## Reproduce

```powershell
npm run check:vendors
npm run check:vendors -- --vendors FLIPKART --query biscuits --pages 2
npm run check:vendors -- --vendors MINUTES --query milk --pincode 560001
npm test
```

The live checker loads the project's Next.js environment configuration and runs
each scraper in an isolated subprocess with a 20-second deadline. It validates
product identities, duplicate IDs, and normalized prices. `PASS` means nonempty,
valid products; `EMPTY` does not prove a broken integration, but is not a passing
live demonstration. Any nonpassing check gives the command a nonzero exit code.
Use `--timeout` to change the deadline in milliseconds, up to 60000.

## Fixes made during the audit

- Empty/non-JSON responses now report the vendor, HTTP status, and content type
  instead of an opaque JSON parse error. Upstream bodies are not included.
- A denied Zepto serviceability request no longer silently selects a default store.
- Blinkit's library entrypoint now defaults to one page and `size=20`, matching
  its CLI rather than sending `size=undefined` from the dashboard.
- Flipkart location gates now produce an explicit error rather than a successful
  empty Minutes result. Explicitly allowed CLI fallback is still supported.
- The Swiggy location helper now executes Playwright's JavaScript entrypoint on
  Windows, fixing `spawnSync playwright-cli ENOENT` with npm command shims.
- Swiggy session extraction has a five-second deadline and respects
  `SWIGGY_PLAYWRIGHT_SESSION`. Cookie-generation CLI commands have a 30-second deadline.
- Missing/out-of-range Swiggy coordinates are rejected instead of interpreting
  empty strings as latitude/longitude zero.
- Settled dashboard vendor requests clear their timeout timers. These timers
  still do not abort the underlying HTTP requests; subprocess isolation in the
  live checker supplies its hard deadline.

## What still needs verification

Swiggy's location helper remains interactive. It sets browser geolocation, then
waits for address confirmation; it does not automatically enter the pincode into
the website. A normal location-set browser session must be established before
claiming the scraper works. Account login is not proven necessary for browsing.

Zepto and Blinkit need current public-browser network observations to distinguish
request-format changes from environmental rejection. A controlled local/VPS
comparison is required before claiming geographic restrictions. The live tests
here did not use the US VPS.

Database connectivity, guest-account creation, notification delivery, and the
alert worker are separate from these scraper checks and were not live-tested.

## Dashboard API verification

The production Next.js build passed. Against a local production server, without
an authenticated session:

- Invalid search input returned HTTP 400.
- A regular Flipkart search returned HTTP 200, 38 listings, and 35 groups in
  approximately 1.5 seconds.
- A four-vendor search returned HTTP 200 with the same successful Flipkart
  listings and explicit errors for the other integrations in approximately
  1.3 seconds. One failed integration did not discard successful results.
- Minutes-only search returned an explicit vendor location-gate error.

These are individual smoke-test observations, not latency benchmarks. All 23
unit tests passed across five files. The dashboard UI still uses ShopLense's
own sign-in/guest flow; this is separate from vendor authentication.

## Follow-up: anonymous browser sessions and adapter repairs

The user selected a Swiggy delivery location in the persistent browser without
logging in. Its public search then returned HTTP 200. This established that an
account login was not necessary for this tested catalog flow.

### Reference implementation verification

The actual `search` function from
[pawan67/instamart-alerts](https://github.com/pawan67/instamart-alerts/blob/master/instamart_alerts/instamart.py),
commit `bae98fedb080772d0b59531283d9c7a067efbdff`, was executed with the existing
anonymous browser cookies. Its search was limited to two pages and returned 159
SKU variants. This tested its HTTP search adapter, not its entire application,
bootstrap, alert delivery, or deployment. No account data was accessed.

[CartRadar's Blinkit adapter](https://github.com/Harsh-Gopal/CartRadar/blob/main/backend/app/platforms/blinkit.py)
was inspected: it uses browser requests and response interception. Its complete
Python application was not executed. The matching approach was tested directly
in ShopLense's already accepted Blinkit browser session instead. Do not interpret
these inspections as a claim that every reference repository works unchanged.

### Root causes and changes

- **Swiggy:** removing the old `swiggy_matcher.txt` value repaired direct HTTP
  search. Testing the current build header with the old matcher still failed;
  testing the old build header without the matcher succeeded. Thus the stale
  matcher, not login or build version alone, was the demonstrated cause.
  The file is no longer implicitly loaded. Explicit `SWIGGY_MATCHER` / `matcher`
  overrides remain available. The build header is now configurable.
- **Swiggy pagination:** its page offset and running search-results offset are
  separate cursors. Both are now carried between requests. ShopLense still emits
  one selected variation per product; the reference adapter emits every SKU,
  so their output counts are not directly comparable.
- **Blinkit:** public browser search returned HTTP 200; Node HTTP still returned
  403 even with fresh cookies and the current app-version header. An optional
  browser-context transport now sends catalog requests from the existing normal
  session. It preserves the same normalized output and pagination behavior.
- **Zepto:** the website uses `bff-gateway.zepto.com`. Changing the old host alone
  did not repair direct requests. The browser transport now observes the site's
  own normal search responses, including scroll-triggered pagination, without
  exporting request-signing or CSRF material. Product extraction now handles
  nested promotional containers and ignores non-product tiles.
- **Location correctness:** Zepto's current site reported the tested `603203`
  area as unserviceable. Its repaired adapter was verified separately at the
  publicly selected `600042` area, not passed off as stock for `603203`.
  Zepto browser transport and coordinate-aware Swiggy callers reject session
  coordinates differing by more than 0.001 degrees on either axis. This is a
  sanity check, not a guarantee that nearby points share a dark store.
- **Setup:** the Swiggy location helper now opens a visible browser and applies
  geolocation, navigation, and the location-button action in the same CLI code
  invocation. It refuses to save a session with no location cookies.

### Observed live output

| Adapter | Observation |
| --- | --- |
| Swiggy | 32 products on one page; 74 distinct products across two pages using the selected anonymous location. A separate milk query also returned 32. |
| Blinkit | 12 products on one page; 24 distinct products across two pages using browser-context requests. |
| Zepto | 52-54 distinct products across two pages in the served `600042` test area. |
| Regular Flipkart | 37 products in the follow-up one-page biscuits query. |

Counts vary between live requests. These are smoke-test observations, not
completeness, accuracy, or performance benchmarks.

### Browser setup and transports

```powershell
playwright-cli -s=swiggy_normal open --browser=chrome --headed --persistent https://www.swiggy.com/instamart
playwright-cli -s=blinkit_normal open --browser=chrome --headed --persistent https://blinkit.com/
playwright-cli -s=zepto_normal open --browser=chrome --headed --persistent https://www.zepto.com/
```

Select a delivery location through the ordinary website UI. Account login is
not required for the anonymous catalog flows verified here. Keep the sessions
running while testing their dependent transports. Match the dashboard/search
coordinates to the selected area; selecting a different pincode in the API does
not silently relocate a Zepto browser session.

`BLINKIT_TRANSPORT` and `ZEPTO_TRANSPORT` accept `auto`, `http`, or `browser`.
Auto tries HTTP first and falls back to an already established browser session.
It does not solve challenges, create accounts, or automatically initialize a
delivery location. Their session names can be overridden with
`BLINKIT_PLAYWRIGHT_SESSION` / `ZEPTO_PLAYWRIGHT_SESSION`. Swiggy still uses HTTP
search with normal browser-derived cookies; `SWIGGY_PLAYWRIGHT_SESSION` chooses
the cookie source, and `SWIGGY_BUILD_VERSION` overrides its web-build header.

Browser catalog operations are asynchronous and serialized per session within
one Node process. Multi-process deployments still need isolated sessions or a
dedicated browser service; sharing one tab across workers is not supported as a
production concurrency strategy. This browser dependency also means the full
repaired integration is not a self-contained Vercel serverless deployment.

### Repaired dashboard API checks

The final production search endpoint was checked without ShopLense authentication:

- Swiggy at its selected session coordinates: HTTP 200, 32 listings, 30 groups.
- Zepto at the served test-area coordinates: HTTP 200, 38 listings, 35 groups.
- Blinkit plus regular Flipkart: HTTP 200, 12 and 37 listings respectively,
  combined into 43 groups.
- A Zepto request at coordinates different from its selected browser location:
  explicit vendor error and zero Zepto listings, rather than mislocated prices.

All 32 unit tests passed across seven files, and the production build passed.
These checks do not establish full exact-product tracker behavior or notification
delivery. In particular, the Zepto browser fallback refuses to infer exact-product
stock from an absent search result; it does not implement a browser detail fetch.

## Follow-up: browser-free GitHub leads

The following checks were performed separately from ShopLense's dependencies.
Reference repositories were cloned under `D:\k0de2\scraper-references`; no new
HTTP transport was integrated into the dashboard based on these failing checks.

### Blinkit: Node.js with impit

Repository: [yniks/blinkit-mcp](https://github.com/yniks/blinkit-mcp), commit
`d28afc6918d6d0d06b24ce67611f0c40f2a3d6b2`.

- Inspected `src/client.ts`, `src/api.ts`, `src/session.ts`, and `src/parse.ts`.
  The public catalog path uses the native `impit` HTTP client, not a browser.
- Installed dependencies with lifecycle scripts disabled and successfully built
  the actual upstream TypeScript implementation.
- Redirected `HOME` and `USERPROFILE` to a fresh temporary directory before
  importing the adapter; verified Node's home directory matched it. No existing
  cookies, account token, or browser state was reused.
- Its actual `ensureAuthKey()` failed with HTTP 403 on
  `/v2/accounts/auth_key/`, both with resolved `impit@0.14.5` and the documented
  `impit@0.14.1` version.
- Separately called its `request()` helper against `/v1/layout/search` with the
  documented anonymous search body and test coordinates. That also returned
  HTTP 403 with `impit@0.14.1`; it did not return any product payload.
- A control request to `https://example.com` using the same native client
  returned HTTP 200. Installation/native binding failure is therefore not the
  observed cause of the Blinkit rejection.

The repository author's successful requests were not reproduced here. This
does not establish that browser-free Blinkit access is impossible elsewhere,
or isolate the rejection to IP, headers, or TLS characteristics. Its cookies-
plus-HTTP variant was not tested in this follow-up because no accepted browser
session was running. No proxy, CAPTCHA solver, or account login was used.

### Zepto: plain HTTPX with cookie bootstrap

Repository: [pawan67/zepto-stock-checker](https://github.com/pawan67/zepto-stock-checker),
commit `ccb106712bfb5db9bb520c7d3c3bec79293da1e1`.

The actual `backend/app/zepto.py` client uses ordinary HTTPX, a cookie jar,
homepage session initialization, and public product-detail/serviceability
requests. It is a product stock checker, not a keyword-search adapter.

- Used a fresh HTTPX client, no supplied cookies, and no proxy.
- The initial serviceability `HEAD` request returned HTTP 202 at the previously
  served test coordinates `12.9755397, 80.2206438`.
- Inspection exposed a cold-start issue in the reference adapter:
  `_handshake_at` starts at zero, but the freshness check only compares it with
  `time.monotonic()`. On this recently booted Windows machine, the comparison
  skipped initial bootstrap. This must not be reported as successful bootstrap.
- Retested using its existing `_ensure_session(force=True)` option. The fresh
  homepage handshake (including its HEAD-to-GET fallback) returned HTTP 202,
  so the client raised `ZeptoError` before a valid session was established.
- Product-detail parsing, live stock, and geocoding were not reached or verified.

Its error message speculates about IP blocking; the observed HTTP status alone
does not prove an Indian-IP requirement. No regional comparison was performed.

### Swiggy: the new lead is an authenticated MCP client

Repository:
[rahulsinghani29-cpu/swiggy-blinkit-price-bot](https://github.com/rahulsinghani29-cpu/swiggy-blinkit-price-bot),
commit `1125c065805ec345e3279c39268518efd6a27b03`.

Source inspection of `bot/swiggy_mcp.py`, `bot/swiggy_auth.py`, and
`bot/instamart_browser.py` showed that its current API-only path connects to
Swiggy MCP with an OAuth bearer token and reads saved account addresses. Its
legacy catalog path uses Firefox/Playwright. It is not an anonymous public HTTP
scraper replacement; authenticated tools and cart mutations were not executed.

The earlier `pawan67/instamart-alerts` HTTP search test remains the verified
cookie-based alternative. In this follow-up, `playwright-cli list` reported no
running browsers and ShopLense's cookie extraction returned no session, so a
fresh cookies-supplied/no-browser-invocation search could not be completed.
That is an unavailable test prerequisite, not a new upstream search failure.

### Conclusion

Regular Flipkart remains verified with plain Node HTTP. Swiggy was verified
previously with anonymous session cookies and HTTP search. Neither new Blinkit
nor Zepto browser-free lead returned catalog data in this local follow-up.
Browser-free execution is a valid architectural target, but these repositories
are not verified drop-in fixes for this machine. Cookie initialization/renewal
should remain separate from routine searches wherever a working HTTP path exists.

## VPN comparison: previously working methods

On October 7, 2026, the user enabled a non-Indian VPN. A country lookup from
Node reported Japan (JP), with xTom Japan Corporation as the network provider.
The lookup's IP address was not recorded. This identifies command-line egress;
browser egress was not separately geolocated.

The saved anonymous Chrome profiles were reopened, retaining their previously
selected Indian delivery locations. The final checks used the previously
working adapters, not the unsuccessful new GitHub leads.

| Previously working method | VPN observation |
| --- | --- |
| Regular Flipkart, native Node HTTP | PASS: 38 biscuits products on one page; 74 across two pages at pincode 603203. |
| Blinkit, browser-context HTTP | PASS: 24 biscuits products across two pages at the original default coordinates; a separate check at the served Chennai test coordinates also returned 24. |
| Zepto, normal browser search interception | FAIL: the website search returned a CloudFront 403 page, and the adapter returned no catalog data. Requested coordinates matched the saved 600042 test area. |
| Swiggy, native HTTP with anonymous location cookies | FAIL: biscuits and milk searches returned HTTP 403, including a retry after the homepage finished loading and cookies were extracted again. Location cookies were present. |

Swiggy's homepage displayed its selected delivery location and products, but
ordinary browser navigation to the biscuits search displayed "Something went
wrong!". Thus homepage availability did not demonstrate a working search API.
Flipkart Minutes still returned its existing location/address gate; it had not
been a passing integration before this VPN test.

These observations show Flipkart and browser-backed Blinkit functioning on this
connection, while the previously working Swiggy and Zepto methods failed. They
are consistent with network-sensitive rejection, but are not a controlled
geofencing proof: turning the VPN off and repeating the same requests and
sessions is still required to distinguish country restrictions, VPN-IP
reputation, session/IP binding, or an unrelated upstream change. No VPN routing
settings were modified, proxies substituted, or challenges solved.

### VPN-off retest

The user then disabled the VPN. Node's country lookup reported India (IN),
on Atria Convergence Technologies Pvt. Ltd. The same saved browser profiles,
delivery locations, queries, and previously working scraper methods were used.

| Method | Indian direct-connection observation |
| --- | --- |
| Flipkart, native HTTP | PASS: 73 biscuits products across two pages. |
| Blinkit, browser-context HTTP | PASS: 24 biscuits products across two pages. |
| Zepto, browser search interception | PASS: 50 biscuits products across two pages in the saved 600042 area; its normal website also loaded again. |
| Swiggy, HTTP with anonymous location cookies | PASS after normal browser-search refresh: 74 biscuits products and 74 milk products, each across two pages. |

Swiggy was not immediately stable after switching networks. An initial test
harness incorrectly assumed its return value was wrapped in `data`; this was
a verification-script error, not a scraper failure. A subsequent correctly
parsed attempt reported session rejection. Loading the ordinary biscuits search
in the same anonymous browser displayed live products, and extracting its
current cookies repaired both subsequent HTTP checks. No login was performed.

The Japan-VPN failure followed by direct-India recovery is reproducible evidence
of network-sensitive behavior for the tested Zepto and Swiggy paths. It does
not isolate country geofencing from VPN-IP reputation or session/IP binding,
particularly because Swiggy required a normal session refresh. An Indian VPN
exit would be the most useful next comparison to separate country from VPN
network effects; another non-Indian exit could test whether Japan's exit IP
was uniquely rejected. Counts are live smoke observations, not benchmarks.

### European VPN retest: Norway

The user next enabled a European VPN. Node's lookup reported Norway (NO),
network Proton AG. A separate lookup opened in a temporary tab in the existing
Zepto Chrome context also reported Norway/Proton AG; the tab was then closed.
Only country/network summaries were reported, not IP addresses or cookie values.

The same saved Indian delivery locations and previously confirmed methods were
retained. No new GitHub HTTP-client leads were tested in this comparison.

| Method | Norway VPN observation |
| --- | --- |
| Flipkart, native HTTP | PASS: 74 biscuits products across two pages. |
| Blinkit, browser-context HTTP | PASS: 24 biscuits products across two pages. |
| Zepto, normal browser search interception | PASS: 50 biscuits products across two pages in the saved 600042 area. The website displayed live prices, unlike the Japan-VPN CloudFront block. |
| Swiggy, native HTTP with anonymous location cookies | Eventually PASS: 74 biscuits products and 74 milk products across two pages; initial requests were rejected. |

Swiggy was intermittent: initial biscuits and milk requests reported session
rejection, and its browser search displayed a login prompt. Refreshing the
ordinary homepage still showed the saved delivery location and public products.
With freshly extracted cookies, milk passed while biscuits initially failed;
the next check passed for both. No account login or location change was made.
This is not an immediate/reliably passing session transition, and the precise
cause of the intermittent failures was not isolated.

Zepto's success with browser egress independently verified as Norwegian rules
out a blanket "Indian IP always required" claim for the tested browser adapter.
Swiggy's successful native HTTP requests through Norway also show that an Indian
exit is not an absolute requirement for this tested cookie-based search path.
The rejected Japanese exit remains consistent with exit-IP reputation, regional
edge behavior, or session effects; these checks do not distinguish them.

## Headless execution verification

The browser launch path now defaults to headless Chrome. `browsers:start` /
`browsers:stop` manage persistent project-local CLI sessions; `--headed` is an
explicit desktop setup option, never an automatic scraper fallback. Closed
catalog/cookie-source sessions are reopened headlessly. Upstream denials do not
cause session restart loops. Swiggy setup no longer waits on stdin by default
and refuses to save missing or mismatched delivery-location cookies.

Tests were performed from a connection reporting India. CLI session listings
confirmed `headed: false`, and Chrome processes included the headless flag.

- Swiggy returned 74 biscuits products across two pages using cookies from
  headless Chrome, including after importing private session state into the
  project-local CLI profile.
- Blinkit's headless browser returned HTTP 403 / an access-denied page.
- Zepto navigation returned HTTP 429 and a Chrome error page. The catalog
  adapter therefore could not collect products; this does not isolate headless
  detection from rate limiting or network effects.
- A separate headless Patchright test with the saved anonymous state also
  failed: Blinkit returned HTTP 403, and Zepto navigation failed. Patchright
  was removed rather than shipped as an unverified workaround.
- Unattended Swiggy setup without a confirmed location exited with a clear
  setup error instead of hanging or overwriting saved cookies.

The global and project-local Playwright CLI used different profile directories
in this environment. Installing the local CLI alone does not migrate existing
sessions; the startup command supports an explicit private `--state` import.
No remote Linux VPS deployment was performed in these checks. Initial address
confirmation and upstream acceptance remain prerequisites for unattended use.
