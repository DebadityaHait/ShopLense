"use client";

import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import { Bell, Check, Filter, Link2, Loader2, MapPin, PackageX, Search, SlidersHorizontal, Store, TrendingDown } from "lucide-react";
import type { ProductGroupResult, SearchResponse, Vendor, VendorProduct } from "@/lib/types";
import { discountAmount, filterAndSortGroups, sortLabels, type SortMode } from "@/lib/result-ranking";

const vendorLabels: Record<Vendor, string> = {
  ZEPTO: "Zepto",
  BLINKIT: "Blinkit",
  FLIPKART: "Flipkart",
  SWIGGY: "Swiggy",
};

const allVendors = Object.keys(vendorLabels) as Vendor[];
type AlertDraft = {
  group: ProductGroupResult;
  listing?: VendorProduct;
} | null;
type ControlTab = "vendors" | "trackers" | "location" | "ranking";

const controlTabs: Array<{ id: ControlTab; label: string }> = [
  { id: "vendors", label: "Vendors" },
  { id: "trackers", label: "Trackers" },
  { id: "location", label: "Location" },
  { id: "ranking", label: "Ranking" },
];

export function Dashboard() {
  const [query, setQuery] = useState("");
  const [lat, setLat] = useState("12.817127");
  const [lon, setLon] = useState("80.04044");
  const [pincode, setPincode] = useState("603203");
  const [exactProductUrls, setExactProductUrls] = useState<Partial<Record<Vendor, string>>>({});
  const [flipkartHyperlocalOnly, setFlipkartHyperlocalOnly] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>(allVendors);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alertDraft, setAlertDraft] = useState<AlertDraft>(null);
  const [mustHaveSearchKeywords, setMustHaveSearchKeywords] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("RELEVANCE");
  const [controlTab, setControlTab] = useState<ControlTab>("vendors");

  async function runSearch(event?: React.FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    const apiResponse = await fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, lat: Number(lat), lon: Number(lon), pincode, vendors, exactProductUrls, flipkartHyperlocalOnly }),
    });
    const body = await apiResponse.json().catch(() => ({}));
    setLoading(false);
    if (!apiResponse.ok) {
      setError(body.error || "Search failed.");
      return;
    }
    setResponse(body);
  }

  const visibleGroups = useMemo(() => {
    if (!response) return [];
    return filterAndSortGroups(response.groups, query, mustHaveSearchKeywords, sortMode);
  }, [mustHaveSearchKeywords, query, response, sortMode]);

  const totals = useMemo(() => {
    const groups = visibleGroups.length;
    const products = visibleGroups.reduce((sum, group) => sum + group.products.length, 0);
    const rawGroups = response?.groups.length || 0;
    return { groups, products, rawGroups };
  }, [response?.groups.length, visibleGroups]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5">
      <form onSubmit={runSearch} className="panel-strong overflow-hidden">
        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">Universal search</p>
            <label className="mt-3 block text-sm font-medium">
              Product query
              <div className="mt-2 flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <Search size={20} className="shrink-0 text-[var(--accent)]" />
                <input
                  className="w-full bg-transparent py-3 text-xl font-semibold tracking-tight text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search biscuits, cheese slices, milk..."
                />
              </div>
            </label>
          </div>
          <button className="btn btn-primary min-h-14 px-6 text-base" disabled={loading || !vendors.length || query.trim().length < 2}>
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
            Run scan
          </button>
        </div>
        <div className="grid border-t border-white/10 bg-white/[0.025] px-5 py-3 text-xs text-[var(--muted)] md:grid-cols-3">
          <span>{vendors.length} vendors enabled</span>
          <span>Location: {lat}, {lon} / {pincode}</span>
          <span>Sort: {sortLabels[sortMode]}</span>
        </div>
      </form>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="panel-strong h-fit overflow-hidden lg:sticky lg:top-28">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal size={17} className="text-[var(--accent)]" />
              Scan Configuration
            </div>
            <p className="muted mt-1 text-xs leading-5">Configure vendors, location, and result ordering without mixing provider-specific fields into search.</p>
          </div>
          <div className="grid grid-cols-4 gap-1 border-b border-white/10 bg-white/[0.025] p-2">
            {controlTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  controlTab === tab.id ? "bg-white/12 text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-white/[0.06]"
                }`}
                onClick={() => setControlTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {controlTab === "vendors" ? (
              <VendorControl
                vendors={vendors}
                setVendors={setVendors}
                flipkartHyperlocalOnly={flipkartHyperlocalOnly}
                setFlipkartHyperlocalOnly={setFlipkartHyperlocalOnly}
              />
            ) : null}
            {controlTab === "trackers" ? (
              <ExactTrackerControl
                vendors={vendors}
                exactProductUrls={exactProductUrls}
                setExactProductUrls={setExactProductUrls}
              />
            ) : null}
            {controlTab === "location" ? (
              <LocationControl lat={lat} lon={lon} pincode={pincode} setLat={setLat} setLon={setLon} setPincode={setPincode} />
            ) : null}
            {controlTab === "ranking" ? (
              <RankingControl
                sortMode={sortMode}
                setSortMode={setSortMode}
                mustHaveSearchKeywords={mustHaveSearchKeywords}
                setMustHaveSearchKeywords={setMustHaveSearchKeywords}
              />
            ) : null}
          </div>
        </aside>

        <section className="flex flex-col gap-4">
        <div className="panel-strong flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="eyebrow">Market scan</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">Comparison Results</h2>
            <p className="muted mt-1 text-sm">
              {totals.groups} groups, {totals.products} listings{totals.rawGroups !== totals.groups ? ` from ${totals.rawGroups}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="glass-chip text-xs">
              <TrendingDown size={14} />
              {sortLabels[sortMode]}
            </span>
            {response?.errors.length ? <span className="glass-chip warning-panel text-xs">{response.errors.length} vendor issue(s)</span> : null}
          </div>
        </div>
        {error ? <div className="panel danger-panel p-4 text-sm">{error}</div> : null}
        {loading ? <SkeletonRows /> : null}
        {!loading && response ? (
          <>
            <VendorStatus response={response} />
            <ResultsTable groups={visibleGroups} onAlert={setAlertDraft} />
          </>
        ) : null}
        {!loading && !response ? (
          <div className="panel grid min-h-72 place-items-center p-10 text-center text-sm text-[var(--muted)]">
            <div>
              <Search className="mx-auto mb-3 text-[var(--accent)]" size={32} />
              <h3 className="text-lg font-semibold text-[var(--foreground)]">No scan yet</h3>
              <p className="muted mt-2 max-w-md">Enter a product query, choose the vendors that matter, then run a scan to compare availability and price.</p>
            </div>
          </div>
        ) : null}
        </section>
      </div>
      {alertDraft ? (
        <AlertDrawer
          draft={alertDraft}
          query={query}
          lat={Number(lat)}
          lon={Number(lon)}
          pincode={pincode}
          vendors={vendors}
          flipkartHyperlocalOnly={flipkartHyperlocalOnly}
          onClose={() => setAlertDraft(null)}
        />
      ) : null}
    </div>
  );
}

function VendorControl(props: {
  vendors: Vendor[];
  setVendors: Dispatch<SetStateAction<Vendor[]>>;
  flipkartHyperlocalOnly: boolean;
  setFlipkartHyperlocalOnly: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {allVendors.map((vendor) => {
        const enabled = props.vendors.includes(vendor);
        return (
          <div key={vendor} className={`rounded-2xl border p-3 transition ${enabled ? "border-white/14 bg-white/[0.055]" : "border-white/10 bg-white/[0.025]"}`}>
            <label className="flex items-start justify-between gap-3">
              <span className="flex gap-3">
                <span className={`grid h-9 w-9 place-items-center rounded-xl border ${enabled ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-white/10 bg-white/[0.04]"}`}>
                  <Store size={17} className={enabled ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{vendorLabels[vendor]}</span>
                  <span className="muted mt-0.5 block text-xs">{vendorHelp(vendor)}</span>
                </span>
              </span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) =>
                  props.setVendors((current) =>
                    event.target.checked ? [...current, vendor] : current.filter((item) => item !== vendor),
                  )
                }
              />
            </label>
            {vendor === "FLIPKART" && enabled ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>
                    <span className="block font-semibold text-[var(--foreground)]">Minutes products only</span>
                    <span className="muted mt-1 block leading-5">Disable fallback to regular Flipkart marketplace results.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={props.flipkartHyperlocalOnly}
                    onChange={(event) => props.setFlipkartHyperlocalOnly(event.target.checked)}
                  />
                </label>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ExactTrackerControl(props: {
  vendors: Vendor[];
  exactProductUrls: Partial<Record<Vendor, string>>;
  setExactProductUrls: Dispatch<SetStateAction<Partial<Record<Vendor, string>>>>;
}) {
  function setExactUrl(vendor: Vendor, value: string) {
    props.setExactProductUrls((current) => ({ ...current, [vendor]: value }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link2 size={16} className="text-[var(--accent)]" />
          Exact product trackers
        </div>
        <p className="muted mt-2 text-xs leading-5">
          Add product URLs only when you need a specific out-of-stock item tracked. These stay separate from normal vendor selection.
        </p>
      </div>
      {allVendors.map((vendor) => {
        const enabled = props.vendors.includes(vendor);
        return (
          <label key={vendor} className={`block rounded-2xl border p-3 text-sm font-medium ${enabled ? "border-white/10 bg-white/[0.04]" : "border-white/5 bg-white/[0.02] opacity-60"}`}>
            {vendorLabels[vendor]}
            <input
              className="field mt-2"
              disabled={!enabled}
              placeholder={exactUrlPlaceholder(vendor)}
              value={props.exactProductUrls[vendor] || ""}
              onChange={(event) => setExactUrl(vendor, event.target.value)}
            />
            <span className="muted mt-2 block text-xs leading-5">{exactTrackerHelp(vendor)}</span>
          </label>
        );
      })}
    </div>
  );
}

function LocationControl(props: {
  lat: string;
  lon: string;
  pincode: string;
  setLat: (value: string) => void;
  setLon: (value: string) => void;
  setPincode: (value: string) => void;
}) {
  const [geoStatus, setGeoStatus] = useState("");

  function useBrowserLocation() {
    if (!navigator.geolocation) {
      setGeoStatus("Browser location is not available.");
      return;
    }
    setGeoStatus("Requesting browser location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        props.setLat(position.coords.latitude.toFixed(6));
        props.setLon(position.coords.longitude.toFixed(6));
        setGeoStatus(`Location updated with ${Math.round(position.coords.accuracy)} m accuracy.`);
      },
      (error) => setGeoStatus(error.message || "Could not read browser location."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MapPin size={16} className="text-[var(--accent)]" />
            Coordinates
          </div>
          <button type="button" className="btn min-h-8 px-3 py-1 text-xs" onClick={useBrowserLocation}>
            Use browser location
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-medium">
            Latitude
            <input className="field mt-1" value={props.lat} onChange={(event) => props.setLat(event.target.value)} />
          </label>
          <label className="text-sm font-medium">
            Longitude
            <input className="field mt-1" value={props.lon} onChange={(event) => props.setLon(event.target.value)} />
          </label>
        </div>
        {geoStatus ? <p className="muted mt-3 text-xs leading-5">{geoStatus}</p> : null}
      </div>
      <label className="block rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm font-medium">
        Pincode
        <input className="field mt-2" value={props.pincode} onChange={(event) => props.setPincode(event.target.value)} />
      </label>
      <div className="warning-panel rounded-2xl border p-3 text-xs leading-5">
        Zepto and Blinkit use coordinates. Flipkart aligns by pincode. Swiggy follows the active browser-cookie location.
      </div>
    </div>
  );
}

function RankingControl(props: {
  sortMode: SortMode;
  setSortMode: (value: SortMode) => void;
  mustHaveSearchKeywords: boolean;
  setMustHaveSearchKeywords: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <label className="block rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm font-medium">
        Sort results
        <select className="field mt-2" value={props.sortMode} onChange={(event) => props.setSortMode(event.target.value as SortMode)}>
          {Object.entries(sortLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm">
        <span>
          <span className="flex items-center gap-2 font-semibold">
            <Filter size={15} className="text-[var(--accent)]" />
            Must include search words
          </span>
          <span className="muted mt-1 block text-xs leading-5">Keeps broad vendor responses from burying exact product matches.</span>
        </span>
        <input
          type="checkbox"
          checked={props.mustHaveSearchKeywords}
          onChange={(event) => props.setMustHaveSearchKeywords(event.target.checked)}
        />
      </label>
    </div>
  );
}

function vendorHelp(vendor: Vendor) {
  if (vendor === "ZEPTO") return "Coordinates plus optional exact item override.";
  if (vendor === "BLINKIT") return "Coordinates and merchant availability.";
  if (vendor === "FLIPKART") return "Pincode-based marketplace results, with optional Minutes-only mode.";
  return "Uses the saved Instamart browser session.";
}

function exactUrlPlaceholder(vendor: Vendor) {
  if (vendor === "ZEPTO") return "https://www.zepto.com/pn/x/pvid/...";
  if (vendor === "BLINKIT") return "https://blinkit.com/prn/x/prid/...";
  if (vendor === "FLIPKART") return "https://www.flipkart.com/...?...pid=...";
  return "https://www.swiggy.com/instamart/item/...";
}

function exactTrackerHelp(vendor: Vendor) {
  if (vendor === "ZEPTO") return "Uses Zepto product-detail when search hides an out-of-stock item.";
  if (vendor === "BLINKIT") return "Creates a disabled placeholder until Blinkit search returns the product again.";
  if (vendor === "FLIPKART") return "Tracks by Flipkart pid and works with the Minutes-only toggle when enabled.";
  return "Tracks by Swiggy Instamart item id and notifies when search returns it again.";
}

function VendorStatus({ response }: { response: SearchResponse }) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      {response.vendorResults.map((result) => (
        <div key={result.vendor} className="panel reveal-in p-3">
          <div className="flex items-center justify-between text-sm font-semibold">
            {vendorLabels[result.vendor]}
            {result.ok ? <Check size={16} className="text-[var(--accent)]" /> : <span className="text-[var(--danger)]">!</span>}
          </div>
          <p className="muted mt-1 text-xs">{result.ok ? `${result.totalResults} results` : result.error}</p>
        </div>
      ))}
    </div>
  );
}

function ResultsTable({ groups, onAlert }: { groups: ProductGroupResult[]; onAlert: (draft: AlertDraft) => void }) {
  if (!groups.length) return <div className="panel p-10 text-center text-sm text-[var(--muted)]">No grouped products found.</div>;
  return (
    <div className="panel overflow-hidden">
      <div className="table-grid border-b border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-semibold uppercase text-[var(--muted)]">
        <span>Product</span>
        <span>Lowest</span>
        <span>Vendors</span>
        <span>Actions</span>
      </div>
      {groups.map((group, groupIndex) => (
        <div key={`${group.id}:${groupIndex}`} className="reveal-in border-b border-white/10 p-4 last:border-b-0" style={{ "--index": groupIndex } as React.CSSProperties}>
          <div className="table-grid gap-3">
            <div>
              <h3 className="font-semibold tracking-tight">{group.canonicalName}</h3>
              <p className="muted text-sm">
                {[group.brand, group.quantity, discountAmount(group) ? `save Rs ${Math.round(discountAmount(group))}` : ""].filter(Boolean).join(" / ")}
              </p>
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--accent-strong)]">{group.lowestPrice == null ? "No price" : `Rs ${group.lowestPrice}`}</div>
            <div className="muted text-sm">{group.products.length} listings, spread Rs {Math.round(group.vendorSpread || 0)}</div>
            <div>
              <button className="btn" onClick={() => onAlert({ group })}>
                <Bell size={16} />
                Group alert
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {group.products.map((product, productIndex) => (
              <article
                key={`${product.vendor}:${product.id}:${productIndex}`}
                className={`rounded-2xl border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:-translate-y-0.5 ${
                  product.available ? "border-white/10 bg-white/[0.045]" : "border-red-300/30 bg-red-950/25"
                }`}
              >
                <div className="flex items-start gap-3">
                  {product.images[0] ? <img src={product.images[0]} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <div className="h-14 w-14 rounded-xl bg-white/10" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{vendorLabels[product.vendor]}</p>
                      {!product.available ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-300/30 bg-red-400/10 px-2 py-1 text-xs font-semibold text-red-100">
                          <PackageX size={13} />
                          Out of stock
                        </span>
                      ) : null}
                    </div>
                    <p className="muted text-sm">{product.quantity || "Quantity unknown"}</p>
                    <PriceBlock product={product} />
                    <p className={`text-xs ${product.available ? "text-[var(--muted)]" : "font-medium text-red-100"}`}>
                      {product.available ? "Available" : `${vendorLabels[product.vendor]} currently unavailable`}{product.sla ? ` / ${product.sla}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {product.deeplink ? <a className="btn min-h-9 flex-1 py-1 text-sm" href={product.deeplink} target="_blank">Open</a> : null}
                  <button className="btn min-h-9 flex-1 py-1 text-sm" onClick={() => onAlert({ group, listing: product })}>
                    {product.available && product.inventory !== 0 ? "Listing alert" : "In-stock reminder"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PriceBlock({ product }: { product: VendorProduct }) {
  const mrp = product.mrp;
  const price = product.offerPrice;
  const hasDiscount = typeof mrp === "number" && typeof price === "number" && mrp > price && mrp > 0;
  const discountPercent = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;

  if (price == null) return <p className="mt-1 font-mono font-semibold">No price</p>;

  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-2">
      <span className="font-mono text-lg font-semibold text-[var(--foreground)]">Rs {price}</span>
      {hasDiscount ? (
        <>
          <span className="font-mono text-xs text-[var(--muted)] line-through">Rs {mrp}</span>
          <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-strong)]">
            {discountPercent}% off
          </span>
        </>
      ) : null}
    </div>
  );
}

function AlertDrawer(props: {
  draft: NonNullable<AlertDraft>;
  query: string;
  lat: number;
  lon: number;
  pincode: string;
  vendors: Vendor[];
  flipkartHyperlocalOnly: boolean;
  onClose: () => void;
}) {
  const selected = props.draft.listing;
  const [ruleType, setRuleType] = useState(selected && !selected.available ? "BACK_IN_STOCK" : "PRICE_BELOW");
  const [targetPrice, setTargetPrice] = useState(String(Math.max(1, Math.floor(props.draft.group.lowestPrice || 100))));
  const [dropPercent, setDropPercent] = useState("10");
  const [ntfyUrl, setNtfyUrl] = useState("");
  const [browserPush, setBrowserPush] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    if (browserPush) await subscribePush();
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: selected ? "LISTING" : "GROUP",
        ruleType,
        targetPrice: ruleType === "DROP_PERCENT" || ruleType === "BACK_IN_STOCK" ? null : Number(targetPrice),
        dropPercent: ruleType === "DROP_PERCENT" ? Number(dropPercent) : null,
        query: props.query,
        lat: props.lat,
        lon: props.lon,
        pincode: props.pincode,
        vendors: selected ? [selected.vendor] : props.vendors,
        flipkartHyperlocalOnly: props.flipkartHyperlocalOnly,
        groupKey: props.draft.group.normalizedKey,
        vendorProductIds: selected ? { [selected.vendor]: selected.id } : null,
        productName: selected?.name || props.draft.group.canonicalName,
        quantity: selected?.quantity || props.draft.group.quantity,
        brand: selected?.brand || props.draft.group.brand,
        ntfyUrl: ntfyUrl || null,
        browserPush,
        intervalMinutes: 30,
        baselinePrice: selected?.offerPrice || props.draft.group.lowestPrice,
      }),
    });
    setSaving(false);
    props.onClose();
  }

  return (
    <div className="fixed inset-0 z-20 bg-[#050809]/70 backdrop-blur-sm" onClick={props.onClose}>
      <aside className="absolute right-0 top-0 h-full w-full max-w-[430px] border-l border-white/10 bg-[#0b1114]/90 p-5 shadow-2xl backdrop-blur-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Notification rule</p>
            <h2 className="mt-1 text-xl font-semibold">Create Alert</h2>
            <p className="muted mt-1 text-sm">{selected ? selected.name : props.draft.group.canonicalName}</p>
          </div>
          <button className="btn min-h-9 px-3 py-1" onClick={props.onClose}>Close</button>
        </div>
        <div className="mt-5 flex flex-col gap-4">
          <label className="text-sm font-medium">
            Rule
            <select className="field mt-1" value={ruleType} onChange={(event) => setRuleType(event.target.value)}>
              <option value="PRICE_BELOW">Price below target</option>
              <option value="LOWEST_BELOW">Lowest vendor below target</option>
              <option value="DROP_PERCENT">Drop percent from current</option>
              <option value="BACK_IN_STOCK">Back in stock</option>
            </select>
          </label>
          {ruleType === "BACK_IN_STOCK" ? (
            <div className="warning-panel rounded-xl border px-3 py-2 text-sm">
              This alert checks the selected listing and notifies you when it is available again.
            </div>
          ) : ruleType === "DROP_PERCENT" ? (
            <label className="text-sm font-medium">
              Drop percent
              <input className="field mt-1" value={dropPercent} onChange={(event) => setDropPercent(event.target.value)} />
            </label>
          ) : (
            <label className="text-sm font-medium">
              Target price
              <input className="field mt-1" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} />
            </label>
          )}
          <label className="text-sm font-medium">
            ntfy.sh URL
            <input className="field mt-1" placeholder="https://ntfy.sh/my-topic" value={ntfyUrl} onChange={(event) => setNtfyUrl(event.target.value)} />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
            Browser push
            <input type="checkbox" checked={browserPush} onChange={(event) => setBrowserPush(event.target.checked)} />
          </label>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <Bell size={17} />
            {saving ? "Saving" : "Save alert"}
          </button>
        </div>
      </aside>
    </div>
  );
}

async function subscribePush() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !key) return;
  const registration = await navigator.serviceWorker.register("/sw.js");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscription),
  });
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function SkeletonRows() {
  return (
    <div className="panel p-4">
      {[0, 1, 2].map((item) => (
        <div key={item} className="mb-3 h-24 animate-pulse rounded-2xl bg-white/[0.07] last:mb-0" />
      ))}
    </div>
  );
}
