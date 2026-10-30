import { listRecipeActivity } from "@meals/actions/activity";
import { ActivityLog } from "@meals/components/activity/activity-log";

export async function RecipeActivityPanel({
  recipeId,
}: {
  recipeId: string;
}) {
  const entries = await listRecipeActivity(recipeId);

  return (
    <section className="shrink-0 rounded-2xl border border-border/80 bg-card/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight">
          Activity
        </h2>
        <p className="text-xs text-muted-foreground">Edits and versions</p>
      </div>
      <ActivityLog
        entries={entries}
        emptyMessage="Recipe edits and saves will show up here."
        className="max-h-72 overflow-y-auto pr-1"
      />
    </section>
  );
}
