import Link from "next/link";
import { ToolsChrome } from "@/components/tools/tools-chrome";
import { requireToolsUser } from "@/lib/tools/auth/session";

export const metadata = {
  title: "House Projects — Tools",
  robots: { index: false, follow: false },
};

/**
 * Placeholder for a future shared house-projects to-do app.
 * Registered in the tool registry so dashboard + nav pick it up automatically.
 */
export default async function HouseProjectsToolPage() {
  const user = await requireToolsUser();

  return (
    <ToolsChrome email={user.email} activeHref="/tools/projects">
      <main className="mx-auto max-w-2xl px-3 py-8 sm:px-6 sm:py-12">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand sm:text-sm">
          House Projects
        </p>
        <h1 className="mt-1 font-serif text-[1.85rem] tracking-tight text-ink sm:mt-2 sm:text-4xl">
          Coming soon
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:mt-4 sm:text-base">
          Shared to-dos for home projects and chores. This route is authenticated
          and registered; the app itself is not built yet.
        </p>
        <p className="mt-6 sm:mt-8">
          <Link
            href="/tools"
            className="inline-flex min-h-11 items-center font-semibold text-brand hover:text-brand-dark"
          >
            ← Back to tools
          </Link>
        </p>
      </main>
    </ToolsChrome>
  );
}
