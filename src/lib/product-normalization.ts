import type { ProductGroupResult, VendorProduct } from "./types";

const STOP_WORDS = new Set([
  "fresh",
  "frozen",
  "pack",
  "combo",
  "offer",
  "best",
  "premium",
  "regular",
  "classic",
  "value",
  "processed",
]);

export function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeQuantity(value: string | null | undefined) {
  const text = normalizeText(value)
    .replace(/\bgrams?\b/g, "g")
    .replace(/\bkilograms?\b|\bkgs?\b/g, "kg")
    .replace(/\bmilliliters?\b|\bmls?\b/g, "ml")
    .replace(/\bliters?\b|\bltrs?\b/g, "l")
    .replace(/\bpieces?\b|\bpcs?\b/g, "pc");
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pc|nos?|dozen)/);
  if (!match) return text;
  let valueNumber = Number(match[1]);
  let unit = match[2];
  if (unit === "kg") {
    valueNumber *= 1000;
    unit = "g";
  } else if (unit === "l") {
    valueNumber *= 1000;
    unit = "ml";
  }
  return `${Math.round(valueNumber * 100) / 100}${unit}`;
}

export function productTokens(product: Pick<VendorProduct, "name" | "brand">) {
  const brand = normalizeText(product.brand);
  return normalizeText(product.name)
    .replace(brand, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function jaccardSimilarity(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const left = new Set(a);
  const right = new Set(b);
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function brandCompatible(left: Pick<VendorProduct, "name" | "brand">, right: Pick<VendorProduct, "name" | "brand">) {
  const leftBrand = normalizeText(left.brand);
  const rightBrand = normalizeText(right.brand);
  if (!leftBrand || !rightBrand) return true;
  if (leftBrand === rightBrand) return true;
  return normalizeText(left.name).includes(rightBrand) || normalizeText(right.name).includes(leftBrand);
}

export function normalizedGroupKey(product: Pick<VendorProduct, "name" | "brand" | "quantity">) {
  const quantity = normalizeQuantity(product.quantity);
  const tokens = productTokens(product).sort().slice(0, 6).join("-");
  const brand = normalizeText(product.brand);
  return [brand, quantity, tokens].filter(Boolean).join(":");
}

export function groupProducts(products: VendorProduct[], threshold = 0.42): ProductGroupResult[] {
  const sorted = [...products].sort((a, b) => {
    const priceA = a.offerPrice ?? Number.MAX_SAFE_INTEGER;
    const priceB = b.offerPrice ?? Number.MAX_SAFE_INTEGER;
    return priceA - priceB;
  });
  const groups: ProductGroupResult[] = [];

  for (const product of sorted) {
    const quantity = normalizeQuantity(product.quantity);
    const tokens = productTokens(product);
    let bestGroup: ProductGroupResult | null = null;
    let bestScore = 0;

    for (const group of groups) {
      if (group.quantity !== quantity) continue;
      const representative = group.products[0];
      if (!brandCompatible(product, representative)) continue;
      const score = jaccardSimilarity(tokens, productTokens(representative));
      if (score > bestScore) {
        bestScore = score;
        bestGroup = group;
      }
    }

    if (!bestGroup || bestScore < threshold) {
      const price = product.offerPrice;
      groups.push({
        id: normalizedGroupKey(product) || `${product.vendor}:${product.id}`,
        canonicalName: product.name,
        brand: product.brand,
        quantity,
        normalizedKey: normalizedGroupKey(product),
        confidence: 1,
        lowestPrice: price,
        vendorSpread: 0,
        products: [product],
      });
      continue;
    }

    bestGroup.products.push(product);
    bestGroup.confidence = Math.round(Math.min(bestGroup.confidence, bestScore) * 100) / 100;
    const prices = bestGroup.products
      .map((item) => item.offerPrice)
      .filter((price): price is number => typeof price === "number" && Number.isFinite(price));
    bestGroup.lowestPrice = prices.length ? Math.min(...prices) : null;
    bestGroup.vendorSpread = prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : 0;
  }

  return groups.sort((a, b) => {
    const priceA = a.lowestPrice ?? Number.MAX_SAFE_INTEGER;
    const priceB = b.lowestPrice ?? Number.MAX_SAFE_INTEGER;
    return priceA - priceB;
  });
}
