import Link from "next/link";
import { navLinks } from "@/lib/site-content";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-ink/[0.06] bg-white">
      <div className="section py-12 md:py-14">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink font-serif text-base text-brand-light">
                K
              </span>
              <span className="font-semibold text-ink">King Street Sites</span>
            </Link>
            <p className="mt-3 text-sm text-ink-muted max-w-xs">
              Ecommerce and restaurant websites built for conversion — plus law, home services, and
              local brands. Denver & Baltimore.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-ink-muted hover:text-ink transition-colors">
                {link.label}
              </a>
            ))}
            <Link href="/login" className="text-sm text-ink-muted hover:text-ink transition-colors">
              Sign in
            </Link>
          </nav>
        </div>

        <p className="mt-10 pt-8 border-t border-ink/[0.06] text-xs text-ink-faint">
          © {year} King Street Sites. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
