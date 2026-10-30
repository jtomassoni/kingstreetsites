import Link from "next/link";
import { ToolsChrome } from "@/components/tools/tools-chrome";
import { requireToolsUser } from "@/lib/tools/auth/session";

export const metadata = {
  title: "Movie List — Tools",
  robots: { index: false, follow: false },
};

/**
 * The local `movielist` folder and its GitHub repo contain only a README stub
 * (`# movielist`). No ranking UI, data model, or API existed to migrate.
 */
export default async function MoviesToolPage() {
  const user = await requireToolsUser();

  return (
    <ToolsChrome email={user.email} activeHref="/tools/movies">
      <main className="mx-auto max-w-2xl px-5 py-12 sm:px-6">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-brand">
          Movie List
        </p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">
          Not implemented yet
        </h1>
        <p className="mt-4 text-ink-muted leading-relaxed">
          The source project at <code className="rounded bg-white px-1">movielist</code>{" "}
          has no application code to migrate — only an empty git repo with a
          placeholder README. This route is authenticated and registered in the
          tool registry so a future Movie List can plug in without new navigation
          wiring.
        </p>
        <p className="mt-4 text-sm text-ink-muted">
          When you build it, add modules under{" "}
          <code className="rounded bg-white px-1">modules/movies</code> and replace
          this page. See <code className="rounded bg-white px-1">docs/TOOLS.md</code>.
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
