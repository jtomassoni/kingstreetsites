import Link from "next/link";
import { toolsLogoutAction } from "@/lib/tools/auth/actions";
import { toolsNavItems } from "@/lib/tools/registry";

function isActive(activeHref: string | undefined, href: string) {
  if (!activeHref) return false;
  if (href === "/tools") return activeHref === "/tools";
  return activeHref === href || activeHref.startsWith(`${href}/`);
}

function currentTool(activeHref: string | undefined) {
  if (!activeHref || activeHref === "/tools") return null;
  return (
    toolsNavItems().find(
      (item) =>
        activeHref === item.href || activeHref.startsWith(`${item.href}/`),
    ) ?? null
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ToolsChrome({
  email,
  activeHref,
  children,
  distractFree = false,
  /** Extra trail after the tool name, e.g. a project title. */
  crumbs = [],
}: {
  email: string;
  activeHref?: string;
  children: React.ReactNode;
  /** Hide tool switcher chrome (arcade play). */
  distractFree?: boolean;
  crumbs?: { label: string; href?: string }[];
}) {
  const nav = toolsNavItems();
  const label = email.split("@")[0] || email;
  const tool = currentTool(activeHref);

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
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 pb-2.5 pt-[max(0.65rem,env(safe-area-inset-top))] sm:gap-3 sm:px-6 sm:py-3.5 sm:pt-3.5">
          <nav
            aria-label="Breadcrumb"
            className="min-w-0 flex-1"
          >
            <ol className="flex min-w-0 items-center gap-1 text-sm sm:gap-1.5">
              <li className="shrink-0">
                <Link
                  href="/tools"
                  className="inline-flex items-center gap-2 text-ink sm:gap-2.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink font-serif text-base text-brand-light sm:h-9 sm:w-9 sm:text-lg">
                    K
                  </span>
                  <span className="font-semibold tracking-tight">Tools</span>
                </Link>
              </li>

              {tool ? (
                <>
                  <li
                    className="shrink-0 text-ink-faint"
                    aria-hidden
                  >
                    <Chevron className="size-3.5 sm:size-4" />
                  </li>
                  <li className="min-w-0">
                    <details className="group relative">
                      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-1.5 py-1 font-medium text-ink marker:content-none [-webkit-details-marker]:hidden hover:bg-ink/[0.04]">
                        <span className="truncate">
                          <span className="sm:hidden">{tool.shortTitle}</span>
                          <span className="hidden sm:inline">{tool.title}</span>
                        </span>
                        <svg
                          className="size-3.5 shrink-0 text-ink-faint transition group-open:rotate-180"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M4 6.5 8 10.5 12 6.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </summary>
                      <div className="absolute left-0 top-full z-50 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-lg shadow-ink/10">
                        <Link
                          href="/tools"
                          className="block px-3 py-2 text-sm text-ink-muted hover:bg-cream hover:text-ink"
                        >
                          All tools
                        </Link>
                        <div className="my-1 border-t border-ink/[0.06]" />
                        {nav.map((item) => {
                          const active = isActive(activeHref, item.href);
                          return (
                            <Link
                              key={item.id}
                              href={item.href}
                              aria-current={active ? "page" : undefined}
                              className={`block px-3 py-2 text-sm ${
                                active
                                  ? "bg-brand/10 font-medium text-brand-dark"
                                  : "text-ink-muted hover:bg-cream hover:text-ink"
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
                      </div>
                    </details>
                  </li>
                </>
              ) : null}

              {crumbs.map((crumb, index) => (
                <li
                  key={`${crumb.label}-${index}`}
                  className="flex min-w-0 items-center gap-1 sm:gap-1.5"
                >
                  <span className="shrink-0 text-ink-faint" aria-hidden>
                    <Chevron className="size-3.5 sm:size-4" />
                  </span>
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="truncate font-medium text-ink-muted hover:text-ink"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className="truncate font-medium text-ink"
                      aria-current="page"
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>

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
      </header>

      {children}
    </div>
  );
}
