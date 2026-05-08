import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { AuthPanel } from "@/components/AuthPanel";
import { AlertsClient } from "@/components/AlertsClient";

export default async function AlertsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return <AuthPanel />;
  return (
    <main className="min-h-[100dvh]">
      <header className="chrome-header">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <p className="eyebrow">Alert operations</p>
            <h1 className="text-2xl font-semibold tracking-tight">ShopLense Alerts</h1>
            <p className="muted text-sm">Manage price checks and delivery methods</p>
          </div>
          <Link className="btn" href="/">Search</Link>
        </div>
      </header>
      <AlertsClient />
    </main>
  );
}
