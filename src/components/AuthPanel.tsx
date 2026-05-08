"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Bell, LineChart, LocateFixed, LogIn, Search, ShieldCheck, Store } from "lucide-react";

const proofPoints = [
  { label: "Vendors", value: "4", detail: "Zepto, Blinkit, Flipkart, Swiggy" },
  { label: "Alert rules", value: "4", detail: "price, drop, lowest, stock" },
  { label: "Location modes", value: "3", detail: "GPS, pincode, cookies" },
];

const capabilities = [
  { icon: Search, title: "One query, many carts", text: "Compare local quick-commerce listings without opening four separate tabs." },
  { icon: LocateFixed, title: "Location-aware results", text: "Use browser GPS, pincode, and Swiggy browser sessions for realistic availability." },
  { icon: Bell, title: "Stock and price alerts", text: "Track price drops and out-of-stock items with browser push or ntfy delivery." },
];

export function AuthPanel() {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    if (mode === "register") {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "Registration failed.");
        setBusy(false);
        return;
      }
    }
    const result = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (result?.error) setError("Invalid email or password.");
    else window.location.reload();
  }

  async function guestLogin() {
    setGuestBusy(true);
    setError("");
    const response = await fetch("/api/auth/guest", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.email || !body.password) {
      setError(body.error || "Guest login failed.");
      setGuestBusy(false);
      return;
    }
    const result = await signIn("credentials", { email: body.email, password: body.password, redirect: false });
    setGuestBusy(false);
    if (result?.error) setError("Guest login failed.");
    else window.location.reload();
  }

  return (
    <main className="min-h-[100dvh] px-4 py-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <nav className="chrome-header rounded-3xl border px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--accent)]/35 bg-[var(--accent-soft)]">
                <Store size={20} className="text-[var(--accent)]" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight">ShopLense</p>
                <p className="muted text-xs">Quick-commerce intelligence</p>
              </div>
            </div>
            <button type="button" className="btn min-h-10 px-4 text-sm" onClick={guestLogin} disabled={guestBusy || busy}>
              <LogIn size={16} />
              {guestBusy ? "Preparing guest" : "Try guest mode"}
            </button>
          </div>
        </nav>

        <section className="grid gap-5 lg:grid-cols-[1.2fr_430px] lg:items-stretch">
          <div className="panel-strong overflow-hidden p-6 md:p-8">
            <div className="grid min-h-[620px] content-between gap-8">
              <div>
                <p className="eyebrow">Live price lens for local commerce</p>
                <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-none tracking-tight md:text-7xl">
                  See the cheaper cart before you place the order.
                </h1>
                <p className="muted mt-5 max-w-2xl text-base leading-7">
                  ShopLense searches nearby quick-commerce and marketplace inventory, groups comparable products, and keeps watching prices or stock after you leave.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <button type="button" className="btn btn-primary min-h-12 px-5" onClick={guestLogin} disabled={guestBusy || busy}>
                    <Search size={17} />
                    Launch demo
                  </button>
                  <a className="btn min-h-12 px-5" href="#signin">
                    Sign in
                  </a>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_1.4fr]">
                <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="glass-chip text-xs">Live scan</span>
                    <LineChart size={18} className="text-[var(--accent)]" />
                  </div>
                  <div className="space-y-3">
                    {["Biscuits", "Cheese slices", "Milk 500 ml"].map((item, index) => (
                      <div key={item} className="reveal-in rounded-2xl border border-white/10 bg-white/[0.04] p-3" style={{ "--index": index } as React.CSSProperties}>
                        <p className="text-sm font-semibold">{item}</p>
                        <p className="muted mt-1 text-xs">Best match grouped across vendors</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3">
                  {capabilities.map((item, index) => (
                    <div key={item.title} className="reveal-in rounded-3xl border border-white/10 bg-white/[0.04] p-4" style={{ "--index": index } as React.CSSProperties}>
                      <div className="flex gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/20">
                          <item.icon size={18} className="text-[var(--accent)]" />
                        </div>
                        <div>
                          <h2 className="font-semibold tracking-tight">{item.title}</h2>
                          <p className="muted mt-1 text-sm leading-6">{item.text}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <form id="signin" onSubmit={submit} className="panel-strong flex flex-col gap-4 p-6">
            <div>
              <p className="eyebrow">Workspace access</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">{mode === "signin" ? "Sign in to ShopLense" : "Create a ShopLense account"}</h2>
              <p className="muted mt-2 text-sm">Use guest mode for an immediate demo, or keep alerts under your own account.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
              <button type="button" className={`btn min-h-9 py-1 ${mode === "signin" ? "border-white/15 bg-white/10" : "border-transparent bg-transparent"}`} onClick={() => setMode("signin")}>
                Sign in
              </button>
              <button type="button" className={`btn min-h-9 py-1 ${mode === "register" ? "border-white/15 bg-white/10" : "border-transparent bg-transparent"}`} onClick={() => setMode("register")}>
                Register
              </button>
            </div>

            <label className="text-sm font-medium">
              Email
              <input className="field mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label className="text-sm font-medium">
              Password
              <input className="field mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
            </label>

            {error ? <p className="danger-panel rounded-xl border px-3 py-2 text-sm">{error}</p> : null}

            <button className="btn btn-primary" disabled={busy}>
              <LogIn size={17} />
              {busy ? "Working" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
            <button type="button" className="btn" onClick={guestLogin} disabled={guestBusy || busy}>
              <ShieldCheck size={17} />
              {guestBusy ? "Preparing guest" : "Continue as shared guest"}
            </button>

            <div className="mt-auto grid gap-2 pt-3">
              {proofPoints.map((point) => (
                <div key={point.label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold">{point.label}</p>
                    <p className="muted text-xs">{point.detail}</p>
                  </div>
                  <p className="font-mono text-xl font-semibold text-[var(--accent-strong)]">{point.value}</p>
                </div>
              ))}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
