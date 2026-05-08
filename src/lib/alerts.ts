import type { AlertCandidate, AlertRuleType } from "./types";

export type AlertLike = {
  ruleType: AlertRuleType;
  targetPrice?: number | null;
  dropPercent?: number | null;
  baselinePrice?: number | null;
};

export function evaluateAlert(alert: AlertLike, candidates: AlertCandidate[]) {
  const priced = candidates.filter((candidate) => Number.isFinite(candidate.price));
  if (alert.ruleType === "BACK_IN_STOCK") {
    const available = candidates.find((candidate) => candidate.available);
    return {
      triggered: Boolean(available),
      candidate: available || null,
      message: available ? `${available.name} is back in stock on ${available.vendor || "a selected vendor"}.` : "",
    };
  }
  if (!priced.length) return { triggered: false, candidate: null, message: "" };
  const lowest = priced.reduce((best, candidate) => (candidate.price < best.price ? candidate : best), priced[0]);

  if (alert.ruleType === "PRICE_BELOW" || alert.ruleType === "LOWEST_BELOW") {
    const target = Number(alert.targetPrice);
    const triggered = Number.isFinite(target) && lowest.price <= target;
    return {
      triggered,
      candidate: lowest,
      message: triggered ? `${lowest.name} is now Rs ${lowest.price} on ${lowest.vendor || "a selected vendor"}.` : "",
    };
  }

  const baseline = Number(alert.baselinePrice);
  const dropPercent = Number(alert.dropPercent);
  const drop = baseline > 0 ? ((baseline - lowest.price) / baseline) * 100 : 0;
  const triggered = Number.isFinite(dropPercent) && drop >= dropPercent;
  return {
    triggered,
    candidate: lowest,
    message: triggered
      ? `${lowest.name} dropped ${Math.round(drop)}% to Rs ${lowest.price} on ${lowest.vendor || "a selected vendor"}.`
      : "",
  };
}

export function buildNtfyPayload(message: string, link?: string | null) {
  return {
    message,
    title: "Price alert",
    tags: "moneybag",
    click: link || undefined,
  };
}
