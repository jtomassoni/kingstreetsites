import Link from "next/link";
import { toolsLogoutAction } from "@/lib/tools/auth/actions";
import { toolsNavItems } from "@/lib/tools/registry";

export function ToolsChrome({
  email,
  activeHref,
  children,
  distractFree = false,
}: {
  email: string;
  activeHref?: string;
  children: React.ReactNode;
  /** Hide tool switcher chrome (arcade play). */
  distractFree?: boolean;
}) {
  const nav = toolsNavItems();
  const label = email.split("@")[0] || email;

  if (distractFree) {
    return (
      <div className="min-h-dvh bg-[#14202b] text-[#f6f1e7]">
        <div className="absolute right-3 top-3 z-50 flex items-center gap-2">
          <Link
            href="/tools"
            className="rounded-lg bg-black/40 px-3 py-1.5 text-xs font-medium text-[#f6f1e7] backdrop-blur hover:bg-black/55"
          >
            Tools
          </Link>
          <form action={toolsLogoutAction}>
            <button
              type="submit"
              className="rounded-lg bg-black/40 px-3 py-1.5 text-xs font-medium text-[#f6f1e7] backdrop-blur hover:bg-black/55"
            >
              Log out
            </button>
          </form>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-cream text-ink">
      <header className="border-b border-ink/[0.06] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/tools"
              className="inline-flex items-center gap-2.5 text-ink"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink font-serif text-lg text-brand-light">
                K
              </span>
              <span className="font-semibold tracking-tight">
                King Street Tools
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-ink-muted">
              Signed in as <span className="font-medium text-ink">{label}</span>
            </span>
            <form action={toolsLogoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-ink/10 bg-cream px-3 py-1.5 font-medium text-ink hover:border-ink/20"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
        <nav
          className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-5 pb-3 sm:px-6"
          aria-label="Tools"
        >
          <Link
            href="/tools"
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              activeHref === "/tools"
                ? "bg-brand/10 text-brand-dark"
                : "text-ink-muted hover:bg-ink/[0.04] hover:text-ink"
            }`}
          >
            Dashboard
          </Link>
          {nav.map((item) => {
            const active =
              activeHref === item.href ||
              (activeHref?.startsWith(item.href + "/") ?? false);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-brand/10 text-brand-dark"
                    : "text-ink-muted hover:bg-ink/[0.04] hover:text-ink"
                }`}
              >
                {item.title}
                {!item.implemented ? (
                  <span className="ml-1 text-xs font-normal text-ink-faint">
                    (soon)
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}
