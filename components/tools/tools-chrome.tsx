import Link from "next/link";
import { ToolIcon } from "@/components/tools/tool-icons";
import { toolsLogoutAction } from "@/lib/tools/auth/actions";
import { toolsNavItems } from "@/lib/tools/registry";

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function isActive(activeHref: string | undefined, href: string) {
  if (!activeHref) return false;
  if (href === "/tools") return activeHref === "/tools";
  return activeHref === href || activeHref.startsWith(`${href}/`);
}

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
        <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex items-center gap-2">
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
      <header className="sticky top-0 z-40 border-b border-ink/[0.06] bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 pb-2.5 pt-[max(0.65rem,env(safe-area-inset-top))] sm:gap-3 sm:px-6 sm:py-4 sm:pt-4">
          <Link
            href="/tools"
            className="inline-flex min-w-0 items-center gap-2 text-ink sm:gap-2.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink font-serif text-base text-brand-light sm:h-9 sm:w-9 sm:text-lg">
              K
            </span>
            <span className="truncate font-semibold tracking-tight text-sm sm:text-base">
              <span className="sm:hidden">Tools</span>
              <span className="hidden sm:inline">King Street Tools</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2 text-xs sm:gap-3 sm:text-sm">
            <span className="hidden max-w-[10rem] truncate text-ink-muted sm:inline">
              Signed in as <span className="font-medium text-ink">{label}</span>
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

        {/* Desktop / tablet tool switcher */}
        <nav
          className="mx-auto hidden max-w-5xl gap-1 overflow-x-auto px-6 pb-3 sm:flex [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Tools"
        >
          <Link
            href="/tools"
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              isActive(activeHref, "/tools")
                ? "bg-brand/10 text-brand-dark"
                : "text-ink-muted hover:bg-ink/[0.04] hover:text-ink"
            }`}
          >
            Dashboard
          </Link>
          {nav.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                isActive(activeHref, item.href)
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
          ))}
        </nav>
      </header>

      <div className="pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:pb-0">
        {children}
      </div>

      {/* Mobile bottom tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/[0.08] bg-white/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Tools"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          <li className="min-w-0">
            <Link
              href="/tools"
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium leading-tight active:scale-[0.96] ${
                isActive(activeHref, "/tools")
                  ? "text-brand-dark"
                  : "text-ink-muted"
              }`}
            >
              <span
                className={`inline-flex size-8 items-center justify-center rounded-xl ${
                  isActive(activeHref, "/tools") ? "bg-brand/12" : ""
                }`}
              >
                <HomeIcon className="size-5" />
              </span>
              <span className="max-w-full truncate">Home</span>
            </Link>
          </li>
          {nav.map((item) => {
            const active = isActive(activeHref, item.href);
            return (
              <li key={item.id} className="min-w-0">
                <Link
                  href={item.href}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium leading-tight active:scale-[0.96] ${
                    active ? "text-brand-dark" : "text-ink-muted"
                  }`}
                >
                  <span
                    className={`inline-flex size-8 items-center justify-center rounded-xl ${
                      active ? "bg-brand/12" : ""
                    }`}
                  >
                    <ToolIcon name={item.icon} className="size-5" />
                  </span>
                  <span className="max-w-full truncate">{item.shortTitle}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
