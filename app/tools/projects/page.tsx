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
      <main className="mx-auto max-w-2xl px-5 py-12 sm:px-6">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-brand">
          House Projects
        </p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">
          Coming soon
        </h1>
        <p className="mt-4 text-ink-muted leading-relaxed">
          Shared to-dos for home projects and chores. This route is authenticated
          and registered in the tool registry; the app itself is not built yet.
        </p>
        <p className="mt-4 text-sm text-ink-muted">
          When you build it, add modules under{" "}
          <code className="rounded bg-white px-1">modules/projects</code>, APIs
          under{" "}
          <code className="rounded bg-white px-1">app/api/tools/projects</code>,
          and replace this page. See{" "}
          <code className="rounded bg-white px-1">docs/TOOLS.md</code>.
        </p>
        <p className="mt-8">
          <Link
            href="/tools"
            className="font-semibold text-brand hover:text-brand-dark"
          >
            ← Back to tools
          </Link>
        </p>
      </main>
    </ToolsChrome>
  );
}
