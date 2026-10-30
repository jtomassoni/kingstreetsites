import Link from "next/link";
import { ToolIcon } from "@/components/tools/tool-icons";
import { ToolsChrome } from "@/components/tools/tools-chrome";
import { requireToolsUser } from "@/lib/tools/auth/session";
import { TOOLS } from "@/lib/tools/registry";

export const metadata = {
  title: "Tools — King Street Sites",
  robots: { index: false, follow: false },
};

export default async function ToolsDashboardPage() {
  const user = await requireToolsUser();

  return (
    <ToolsChrome email={user.email} activeHref="/tools">
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-brand">
            Private
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink sm:text-5xl">
            Household tools
          </h1>
          <p className="mt-3 text-base text-ink-muted sm:text-lg">
            Meal planning, movies, and a quick arcade — signed in once for all
            three.
          </p>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <li key={tool.id}>
              <Link
                href={tool.href}
                className="group flex h-full flex-col rounded-2xl border border-ink/[0.06] bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand-dark">
                  <ToolIcon name={tool.icon} className="h-5 w-5" />
                </span>
                <span className="mt-4 font-serif text-2xl tracking-tight text-ink">
                  {tool.title}
                </span>
                <span className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">
                  {tool.description}
                </span>
                <span className="mt-5 text-sm font-semibold text-brand group-hover:text-brand-dark">
                  {tool.implemented ? "Open →" : "View status →"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </ToolsChrome>
  );
}
