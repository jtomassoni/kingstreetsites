import Link from "next/link";
import { redirect } from "next/navigation";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { query } from "@meals/lib/db";

export default async function GroceryIndexPage() {
  const { householdId } = await requireHouseholdContext();
  const lists = await query<{
    id: string;
    status: string;
    generated_at: string | null;
    created_at: string;
  }>`
    SELECT id, status, generated_at, created_at
    FROM grocery_lists
    WHERE household_id = ${householdId}
    ORDER BY created_at DESC
  `;

  const active = lists.find((l) => l.status === "active");
  const target = active ?? lists[0];

  if (target) {
    redirect(`/tools/meals/grocery/${target.id}`);
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-3">
      <h1 className="font-display text-2xl font-semibold">Grocery</h1>
      <p className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-6 text-sm text-muted-foreground">
        No grocery list yet. Add meals on the{" "}
        <Link
          href="/tools/meals/week"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          week board
        </Link>{" "}
        and the list builds itself here.
      </p>
    </div>
  );
}
