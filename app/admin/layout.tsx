import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import AdminNav from "./admin-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-[#06080f] via-slate-950 to-[#0b0d12]">
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.07] bg-slate-950/85 py-6 px-4 shadow-[4px_0_24px_-8px_rgba(0,0,0,0.5)] backdrop-blur-sm">
        <div className="mb-6 px-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-400">King Street Sites</p>
          <p className="mt-1 text-[11px] text-slate-500">Leads & customers</p>
        </div>

        <AdminNav />

        <div className="mt-auto border-t border-white/[0.06] pt-4">
          <p className="mb-2 truncate px-2 text-xs text-slate-600">{session.user?.email}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="relative flex-1 overflow-auto p-5 md:p-8">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_110%_70%_at_50%_-15%,rgba(45,212,191,0.09),transparent_52%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_100%_30%,rgba(139,92,246,0.05),transparent_50%)]"
          aria-hidden
        />
        <div className="relative z-10">{children}</div>
      </main>
    </div>
  );
}
