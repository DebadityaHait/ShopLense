import type { ProductGroupResult } from "./types";

export const sortLabels = {
  RELEVANCE: "Best match",
  LOWEST_PRICE: "Lowest price",
  DISCOUNT_AMOUNT: "Biggest discount",
  DISCOUNT_PERCENT: "Best discount %",
  VENDOR_COUNT: "Most vendors",
} as const;

export type SortMode = keyof typeof sortLabels;

export function searchTokens(query: string) {
  return normalizeForSearch(query)
    .split(" ")
    .filter((token) => token.length > 1);
}

export function normalizeForSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function groupText(group: ProductGroupResult) {
  return normalizeForSearch(
    [
      group.canonicalName,
      group.brand,
      group.quantity,
      ...group.products.flatMap((product) => [product.name, product.brand, product.quantity]),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function groupMatchesAllKeywords(group: ProductGroupResult, tokens: string[]) {
  if (!tokens.length) return true;
  const text = groupText(group);
  return tokens.every((token) => text.includes(token));
}

export function groupRelevance(group: ProductGroupResult, query: string) {
  const normalizedQuery = normalizeForSearch(query);
  const tokens = searchTokens(query);
  const canonical = normalizeForSearch(`${group.brand || ""} ${group.canonicalName}`);
  const text = groupText(group);
  const matchingTokens = tokens.filter((token) => text.includes(token)).length;
  const exactProductMatch = group.products.some((product) => normalizeForSearch(product.name).includes(normalizedQuery));

  let score = matchingTokens * 12;
  if (normalizedQuery && canonical.includes(normalizedQuery)) score += 80;
  if (exactProductMatch) score += 60;
  if (tokens.length && tokens.every((token) => canonical.includes(token))) score += 35;
  score += Math.min(group.products.length, 4) * 2;
  return score;
}

export function discountAmount(group: ProductGroupResult) {
  return Math.max(
    0,
    ...group.products.map((product) =>
      product.mrp && product.offerPrice && product.mrp > product.offerPrice ? product.mrp - product.offerPrice : 0,
    ),
  );
}

export function discountPercent(group: ProductGroupResult) {
  return Math.max(
    0,
    ...group.products.map((product) =>
      product.mrp && product.offerPrice && product.mrp > product.offerPrice
        ? ((product.mrp - product.offerPrice) / product.mrp) * 100
        : 0,
    ),
  );
}

export function filterAndSortGroups(groups: ProductGroupResult[], query: string, mustHaveSearchKeywords: boolean, sortMode: SortMode) {
  const tokens = searchTokens(query);
  const filtered = mustHaveSearchKeywords ? groups.filter((group) => groupMatchesAllKeywords(group, tokens)) : [...groups];

  return filtered.sort((left, right) => {
    if (sortMode === "LOWEST_PRICE") {
      return (left.lowestPrice ?? Number.MAX_SAFE_INTEGER) - (right.lowestPrice ?? Number.MAX_SAFE_INTEGER);
    }
    if (sortMode === "DISCOUNT_AMOUNT") {
      return discountAmount(right) - discountAmount(left) || groupRelevance(right, query) - groupRelevance(left, query);
    }
    if (sortMode === "DISCOUNT_PERCENT") {
      return discountPercent(right) - discountPercent(left) || groupRelevance(right, query) - groupRelevance(left, query);
    }
    if (sortMode === "VENDOR_COUNT") {
      return right.products.length - left.products.length || groupRelevance(right, query) - groupRelevance(left, query);
    }
    return (
      groupRelevance(right, query) - groupRelevance(left, query) ||
      (left.lowestPrice ?? Number.MAX_SAFE_INTEGER) - (right.lowestPrice ?? Number.MAX_SAFE_INTEGER)
    );
  });
}
