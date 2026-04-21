import Link from "next/link";
import { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Free Site Audit" }
];

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-semibold tracking-wide text-white">
            King Street Sites
          </Link>
          <nav aria-label="Primary navigation" className="hidden gap-6 md:flex">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-slate-300 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                {item.label}
              </Link>
            ))}
          </nav>
          <Link href="/contact" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            Request Audit
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-slate-300 md:flex-row md:items-center md:justify-between">
          <p>Websites that turn visitors into customers.</p>
          <p>Built for restaurants, law firms, contractors, and local businesses.</p>
        </div>
      </footer>
    </div>
  );
}
