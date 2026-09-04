"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { crm } from "@/lib/admin-ui";

const PRIMARY = [
  { href: "/admin/leads", label: "People", match: (p: string) => p.startsWith("/admin/leads") },
  { href: "/admin/billing", label: "Billing", match: (p: string) => p.startsWith("/admin/billing") },
  { href: "/admin/tax", label: "Tax", match: (p: string) => p.startsWith("/admin/tax") },
];

export default function AdminNav({
  email,
  signOutAction,
}: {
  email: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const settingsActive = pathname.startsWith("/admin/settings");

  return (
    <header className="sticky top-0 z-20 border-b border-crm-border/50 bg-[#12171f]/75 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-[min(100%,92rem)] items-end justify-between gap-6 px-5 md:px-8">
        <div className="flex min-w-0 items-end gap-8">
          <Link href="/admin/leads" className="pb-3 text-sm font-semibold text-crm-text">
            King Street
          </Link>
          <nav className={`${crm.tabs} flex-1`} aria-label="Admin">
            {PRIMARY.map((item) => (
              <Link key={item.href} href={item.href} className={crm.tab(item.match(pathname))}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-4 pb-3">
          <Link href="/admin/settings" className={crm.tab(settingsActive)}>
            Settings
          </Link>
          {email ? <span className="hidden max-w-[10rem] truncate text-xs text-crm-faint md:inline">{email}</span> : null}
          <form action={signOutAction}>
            <button type="submit" className={crm.btnGhost}>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
