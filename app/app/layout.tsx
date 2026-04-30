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
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-white/10 flex flex-col py-6 px-4 gap-1">
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

      {/* Main */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
