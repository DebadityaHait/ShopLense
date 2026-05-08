# Swiggy Manual Cookie Guide

This guide explains how to manually get the Swiggy Instamart cookies needed by `swiggy_scraper.js`, and how to use them locally or on a VPS.

## Why This Is Needed

Swiggy Instamart protects the search API with browser/session cookies and AWS WAF.

The scraper needs a valid browser cookie string containing location and WAF data. The important cookies usually include:

```text
deviceId
lat
lng
address
userLocation
aws-waf-token
```

The `aws-waf-token` expires or rotates, so the cookie string cannot be treated as permanent.

## Step 1: Open Swiggy In A Browser

Use a normal browser such as Chrome or Edge.

Open:

```text
https://www.swiggy.com/instamart
```

Set the delivery location you want to track.

For the earlier test location, the selected pincode was:

```text
603203
```

## Step 2: Trigger A Search

Open:

```text
https://www.swiggy.com/instamart/search?custom_back=true&query=chicken
```

Or use the Instamart search box and search:

```text
chicken
```

## Step 3: Open DevTools Network

In Chrome or Edge:

```text
F12 -> Network
```

Then refresh the Swiggy search page.

In the Network filter box, search for:

```text
search/v2
```

Click the request that looks like:

```text
POST https://www.swiggy.com/api/instamart/search/v2?offset=0&ageConsent=false&voiceSearchTrackingId=&storeId=&primaryStoreId=&secondaryStoreId=
```

## Step 4: Copy Required Headers

In the request details, open:

```text
Headers -> Request Headers
```

Copy the full value of:

```text
cookie
```

Also copy this header if it exists:

```text
matcher
```

The cookie value should look like one long line:

```text
deviceId=...; tid=...; sid=...; versionCode=1200; platform=web; subplatform=dweb; lat=...; lng=...; address=...; userLocation=...; aws-waf-token=...
```

Do not copy only `aws-waf-token`. The scraper also needs the signed location cookies.

## Step 5: Use The Cookie Locally

In PowerShell, set the cookie as an environment variable:

```powershell
$env:SWIGGY_COOKIE = "paste the full cookie header here"
```

If you copied a `matcher` header:

```powershell
$env:SWIGGY_MATCHER = "paste matcher value here"
```

Run:

```powershell
node .\swiggy_scraper.js --query chicken
```

Write output to a file:

```powershell
cmd /c "node swiggy_scraper.js --query chicken > swiggy_output.json"
```

`cmd /c` is used here because PowerShell's `>` can write JSON in UTF-16 on some setups.

## Step 6: Use The Cookie From Files

Create a file:

```text
swiggy_cookie.txt
```

Paste the full cookie header into it as one line.

Optionally create:

```text
swiggy_matcher.txt
```

Paste the matcher value into it.

Run:

```powershell
$env:SWIGGY_COOKIE = Get-Content .\swiggy_cookie.txt -Raw
$env:SWIGGY_MATCHER = Get-Content .\swiggy_matcher.txt -Raw
cmd /c "node swiggy_scraper.js --query chicken > swiggy_output.json"
```

## Step 7: Use On A VPS

Copy these files to the VPS:

```text
swiggy_scraper.js
swiggy_cookie.txt
swiggy_matcher.txt
```

Set env vars before running:

```powershell
$env:SWIGGY_COOKIE = Get-Content .\swiggy_cookie.txt -Raw
$env:SWIGGY_MATCHER = Get-Content .\swiggy_matcher.txt -Raw
node .\swiggy_scraper.js --query chicken
```

For scheduled output:

```powershell
cmd /c "node swiggy_scraper.js --query chicken > swiggy_output.json"
```

## When It Stops Working

If the scraper fails with:

```text
ERR_NON_2XX_3XX_RESPONSE
```

or:

```text
Swiggy returned an empty response
```

the cookie or WAF token is probably expired.

Fix:

1. Open Swiggy in your browser again.
2. Refresh the Instamart search page.
3. Copy the latest `cookie` header.
4. Copy the latest `matcher` header, if present.
5. Replace the values in `swiggy_cookie.txt` and `swiggy_matcher.txt`.
6. Run the scraper again.

## Notes

- The cookie is location-specific.
- The cookie can be IP/browser-session sensitive.
- Do not commit cookie files to git.
- Keep request frequency low to reduce failures.
- The script does not generate or bypass Swiggy WAF tokens.
