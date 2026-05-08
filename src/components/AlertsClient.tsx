"use client";

import { useEffect, useState } from "react";
import { BellOff, Pause, Play, Trash2 } from "lucide-react";

type AlertRecord = {
  id: string;
  active: boolean;
  productName: string;
  ruleType: string;
  targetPrice: string | null;
  dropPercent: number | null;
  vendors: string[];
  flipkartHyperlocalOnly: boolean;
  ntfyUrl: string | null;
  browserPush: boolean;
  intervalMinutes: number;
  lastCheckedAt: string | null;
  lastMatchedPrice: string | null;
  nextCheckAt: string;
};

export function AlertsClient() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAlerts() {
    setLoading(true);
    const response = await fetch("/api/alerts");
    const body = await response.json().catch(() => ({ alerts: [] }));
    setAlerts(body.alerts || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAlerts();
  }, []);

  async function toggle(alert: AlertRecord) {
    await fetch(`/api/alerts/${alert.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !alert.active }),
    });
    await loadAlerts();
  }

  async function remove(id: string) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    await loadAlerts();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      {loading ? <div className="panel p-6 text-sm text-[var(--muted)]">Loading alerts...</div> : null}
      {!loading && !alerts.length ? (
        <div className="panel flex flex-col items-center gap-3 p-10 text-center text-sm text-[var(--muted)]">
          <BellOff size={30} className="text-[var(--accent)]" />
          No alerts yet.
        </div>
      ) : null}
      <div className="grid gap-3">
        {alerts.map((alert, index) => (
          <article key={alert.id} className="panel reveal-in p-4" style={{ "--index": index } as React.CSSProperties}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${alert.active ? "bg-[var(--accent)]" : "bg-white/30"}`} />
                  <h2 className="font-semibold tracking-tight">{alert.productName}</h2>
                </div>
                <p className="muted mt-2 text-sm">
                  {ruleText(alert)} / {alert.vendors.join(", ")} / every {alert.intervalMinutes} min
                </p>
                {alert.flipkartHyperlocalOnly ? <p className="mt-1 text-xs text-[var(--accent-strong)]">Flipkart Minutes only</p> : null}
                <p className="muted mt-1 text-xs">
                  Last checked {alert.lastCheckedAt ? new Date(alert.lastCheckedAt).toLocaleString() : "never"} / next {new Date(alert.nextCheckAt).toLocaleString()}
                </p>
                <p className="muted mt-1 text-xs">
                  Delivery: {[alert.ntfyUrl ? "ntfy" : null, alert.browserPush ? "browser push" : null].filter(Boolean).join(", ") || "none"}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn" onClick={() => toggle(alert)} title={alert.active ? "Pause" : "Resume"}>
                  {alert.active ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button className="btn" onClick={() => remove(alert.id)} title="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ruleText(alert: AlertRecord) {
  if (alert.ruleType === "DROP_PERCENT") return `${alert.dropPercent}% drop`;
  if (alert.ruleType === "BACK_IN_STOCK") return "back in stock";
  if (alert.ruleType === "LOWEST_BELOW") return `lowest below Rs ${alert.targetPrice}`;
  return `price below Rs ${alert.targetPrice}`;
}
