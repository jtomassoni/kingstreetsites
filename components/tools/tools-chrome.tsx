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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              href="/tools"
              className="inline-flex min-w-0 items-center gap-2 text-ink sm:gap-2.5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink font-serif text-base text-brand-light sm:h-9 sm:w-9 sm:text-lg">
                K
              </span>
              <span className="truncate font-semibold tracking-tight text-sm sm:text-base">
                King Street Tools
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm">
            <span className="max-w-[7.5rem] truncate font-medium text-ink sm:max-w-none sm:font-normal sm:text-ink-muted">
              <span className="sm:hidden">{label}</span>
              <span className="hidden sm:inline">
                Signed in as{" "}
                <span className="font-medium text-ink">{label}</span>
              </span>
            </span>
            <form action={toolsLogoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-ink/10 bg-cream px-2.5 py-1.5 font-medium text-ink hover:border-ink/20 sm:px-3"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
        <nav
          className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2.5 sm:px-6 sm:pb-3"
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
