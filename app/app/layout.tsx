import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/auth";

const NAV = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/leads", label: "Leads" },
  { href: "/app/settings", label: "Agent Controls" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-[#06080f] via-slate-950 to-[#0b0d12]">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-white/[0.07] bg-slate-950/85 py-6 px-4 shadow-[4px_0_24px_-8px_rgba(0,0,0,0.5)] backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-400 px-2 mb-4">King Street Sites</p>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            {item.label}
          </Link>
        ))}
        <div className="mt-auto">
          <p className="text-xs text-slate-600 px-2 mb-2 truncate">{session.user?.email}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="w-full text-left rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main — layered wash so the canvas is not flat navy */}
      <main className="relative flex-1 overflow-auto p-5 md:p-8">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_110%_70%_at_50%_-15%,rgba(45,212,191,0.09),transparent_52%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_100%_30%,rgba(139,92,246,0.06),transparent_50%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02)_0px,transparent_32rem)]"
          aria-hidden
        />
        <div className="relative z-10">{children}</div>
      </main>
    </div>
  );
}
