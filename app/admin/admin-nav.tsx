"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PRIMARY = [
  { href: "/admin/leads", label: "People", match: (p: string) => p.startsWith("/admin/leads") },
  { href: "/admin/billing", label: "Billing", match: (p: string) => p.startsWith("/admin/billing") },
];

function navClass(active: boolean, primary: boolean) {
  if (active) {
    return primary
      ? "rounded-lg bg-teal-500/15 px-3 py-2 text-sm font-semibold text-teal-100 ring-1 ring-teal-500/30"
      : "rounded-lg bg-white/5 px-3 py-2 text-sm font-medium text-slate-200";
  }
  return primary
    ? "rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
    : "rounded-lg px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300";
}

export default function AdminNav() {
  const pathname = usePathname();
  const settingsActive = pathname.startsWith("/admin/settings");

  return (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Admin">
      <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
        CRM
      </p>
      {PRIMARY.map((item) => (
        <Link key={item.href} href={item.href} className={navClass(item.match(pathname), true)}>
          {item.label}
        </Link>
      ))}

      <div className="mt-auto pt-6">
        <Link href="/admin/settings" className={navClass(settingsActive, false)}>
          Settings
        </Link>
      </div>
    </nav>
  );
}
