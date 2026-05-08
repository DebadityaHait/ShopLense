export const VENDORS = ["ZEPTO", "BLINKIT", "FLIPKART", "SWIGGY"] as const;

export type Vendor = (typeof VENDORS)[number];

export type VendorProduct = {
  id: string;
  vendor: Vendor;
  platformName: string;
  name: string;
  brand: string;
  available: boolean;
  images: string[];
  mrp: number | null;
  offerPrice: number | null;
  quantity: string;
  deeplink: string | null;
  rating: number | null;
  ratingCount: number | null;
  inventory: number | null;
  sla: string | null;
  raw: unknown;
};

export type VendorResult = {
  vendor: Vendor;
  ok: boolean;
  products: VendorProduct[];
  totalResults: number;
  error?: string;
  locationNote?: string;
};

export type ProductGroupResult = {
  id: string;
  canonicalName: string;
  brand: string;
  quantity: string;
  normalizedKey: string;
  confidence: number;
  lowestPrice: number | null;
  vendorSpread: number | null;
  products: VendorProduct[];
};

export type SearchResponse = {
  searchRunId?: string;
  groups: ProductGroupResult[];
  vendorResults: VendorResult[];
  errors: Array<{ vendor: Vendor; message: string }>;
};

export type AlertRuleType = "PRICE_BELOW" | "DROP_PERCENT" | "LOWEST_BELOW" | "BACK_IN_STOCK";

export type AlertCandidate = {
  price: number;
  available?: boolean;
  vendor?: Vendor;
  name: string;
  link?: string | null;
};
