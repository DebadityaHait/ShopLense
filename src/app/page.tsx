import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { AuthPanel } from "@/components/AuthPanel";
import { Dashboard } from "@/components/Dashboard";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return <AuthPanel />;
  return (
    <main className="min-h-[100dvh]">
      <header className="chrome-header">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <p className="eyebrow">Live vendor desk</p>
            <h1 className="text-2xl font-semibold tracking-tight">ShopLense</h1>
            <p className="muted text-sm">{session.user.email}</p>
          </div>
          <nav className="flex items-center gap-2">
            <Link className="btn" href="/alerts">Alerts</Link>
          </nav>
        </div>
      </header>
      <Dashboard />
    </main>
  );
}
