import { redirect } from "next/navigation";
import { ThemeScript } from "@meals/components/theme/theme-script";
import { AppShell } from "@meals/components/layout/app-shell";
import { AuthError, requireHouseholdContext } from "@meals/lib/auth/session";
import { queryOne } from "@meals/lib/db";
import Link from "next/link";
import "@meals/meals.css";

export const metadata = {
  title: {
    default: "Meal Planner",
    template: "%s · Meal Planner",
  },
  robots: { index: false, follow: false },
};

export default async function MealsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const { user } = await requireHouseholdContext();
    const profile = await queryOne<{
      display_name: string | null;
      email: string | null;
    }>`
      SELECT display_name, email FROM profiles WHERE id = ${user.id} LIMIT 1
    `;

    const email = profile?.email ?? user.email;
    const name = profile?.display_name?.trim() || email;

    return (
      <div className="tools-meals min-h-dvh" data-theme="light">
        <ThemeScript />
        <div className="border-b border-border/50 bg-card/80 px-3 py-2 text-sm backdrop-blur md:px-4">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
            <Link
              href="/tools"
              className="font-medium text-primary hover:underline"
            >
              ← Tools
            </Link>
            <span className="truncate text-muted-foreground">{email}</span>
          </div>
        </div>
        <AppShell user={{ name, email }}>{children}</AppShell>
      </div>
    );
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.code === "unauthenticated" || error.code === "unauthorized") {
        redirect("/tools/login?next=/tools/meals");
      }
      return (
        <div className="tools-meals mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 text-center">
          <h1 className="font-display text-2xl font-semibold">
            Household setup needed
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your tools session is valid, but no meal-planner household membership
            was found. Confirm{" "}
            <code className="rounded bg-muted px-1">MEALS_DATABASE_URL</code>{" "}
            points at the existing Meal Planner Neon database, then sign in
            again.
          </p>
          <p className="mt-4">
            <Link href="/tools" className="text-primary underline">
              Back to tools
            </Link>
          </p>
        </div>
      );
    }
    throw error;
  }
}
