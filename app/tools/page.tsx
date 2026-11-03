import Link from "next/link";
import { ToolIcon } from "@/components/tools/tool-icons";
import { ToolsChrome } from "@/components/tools/tools-chrome";
import { isSuperAdmin, roleForEmail } from "@/lib/tools/auth/roles";
import { requireToolsUser } from "@/lib/tools/auth/session";
import { TOOLS } from "@/lib/tools/registry";

export const metadata = {
  title: "Apps — King Street Sites",
  robots: { index: false, follow: false },
};

export default async function ToolsDashboardPage() {
  const user = await requireToolsUser();
  const showCrm = isSuperAdmin(user.email);
  const role = roleForEmail(user.email);

  return (
    <ToolsChrome email={user.email} activeHref="/tools">
      <main className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-10">
        <div className="max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand sm:text-sm">
            {role === "super_admin" ? "Super admin" : "App user"}
          </p>
          <h1 className="mt-1 font-serif text-[1.85rem] leading-tight tracking-tight text-ink sm:mt-2 sm:text-5xl">
            Choose an app
          </h1>
          <p className="mt-2 text-sm text-ink-muted sm:mt-3 sm:text-lg">
            {showCrm
              ? "Household tools and business CRM — signed in once."
              : "Household tools — signed in once."}
          </p>
        </div>

        <ul className="mt-6 grid gap-3 sm:mt-10 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <li key={tool.id}>
              <Link
                href={tool.href}
                className="group flex h-full flex-col rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card transition active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:p-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand-dark sm:h-11 sm:w-11">
                  <ToolIcon name={tool.icon} className="h-5 w-5" />
                </span>
                <span className="mt-3 font-serif text-xl tracking-tight text-ink sm:mt-4 sm:text-2xl">
                  {tool.title}
                </span>
                <span className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-muted sm:mt-2">
                  {tool.description}
                </span>
                <span className="mt-4 text-sm font-semibold text-brand group-hover:text-brand-dark sm:mt-5">
                  {tool.implemented ? "Open →" : "View status →"}
                </span>
              </Link>
            </li>
          ))}

          {showCrm ? (
            <li>
              <Link
                href="/admin/leads"
                className="group flex h-full flex-col rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card transition active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:p-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-brand-light sm:h-11 sm:w-11">
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                <span className="mt-3 font-serif text-xl tracking-tight text-ink sm:mt-4 sm:text-2xl">
                  Business CRM
                </span>
                <span className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-muted sm:mt-2">
                  Leads, billing, and tax for King Street Sites.
                </span>
                <span className="mt-4 text-sm font-semibold text-brand group-hover:text-brand-dark sm:mt-5">
                  Open →
                </span>
              </Link>
            </li>
          ) : null}
        </ul>
      </main>
    </ToolsChrome>
  );
}
