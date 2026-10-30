import { formatActivityWhen } from "@meals/lib/activity/format";
import type { ActivityLogEntry } from "@meals/actions/activity";
import { cn } from "@meals/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  recipe_created: "Created",
  recipe_edited: "Edited",
  recipe_deleted: "Removed",
  recipe_restored: "Restored",
  meal_added: "Added",
  meals_added: "Added",
  meal_removed: "Removed",
  meal_updated: "Updated",
  meal_duplicated: "Duplicated",
  meals_cleared: "Cleared",
  week_copied: "Copied",
};

function actionLabel(actionType: string) {
  return ACTION_LABELS[actionType] ?? "Changed";
}

export function ActivityLog({
  entries,
  emptyMessage = "No activity yet.",
  className,
  compact = false,
}: {
  entries: ActivityLogEntry[];
  emptyMessage?: string;
  className?: string;
  compact?: boolean;
}) {
  if (!entries.length) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <ol className={cn("space-y-2", className)}>
      {entries.map((entry) => (
        <li
          key={entry.id}
          className={cn(
            "rounded-xl border border-border/70 bg-card/70",
            compact ? "px-3 py-2" : "px-3.5 py-2.5",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm leading-snug text-foreground">
                <span className="font-medium">{entry.actorName}</span>{" "}
                <span className="text-muted-foreground">
                  {actionLabel(entry.actionType).toLowerCase()}
                </span>{" "}
                {entry.summary}
              </p>
            </div>
            <time
              dateTime={entry.createdAt}
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
            >
              {formatActivityWhen(entry.createdAt)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
