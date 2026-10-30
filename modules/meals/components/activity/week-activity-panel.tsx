import { listWeekPlanActivity } from "@meals/actions/activity";
import { ActivityLog } from "@meals/components/activity/activity-log";

export async function WeekActivityPanel({
  weeklyPlanId,
}: {
  weeklyPlanId: string;
}) {
  const entries = await listWeekPlanActivity(weeklyPlanId);

  return (
    <section className="week-activity-panel mt-3 rounded-2xl border border-border/70 bg-card/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight">
          Activity
        </h2>
        <p className="text-xs text-muted-foreground">
          Who changed this week
        </p>
      </div>
      <ActivityLog
        entries={entries}
        compact
        emptyMessage="Meal adds, edits, and clears will show up here."
        className="max-h-56 overflow-y-auto pr-1"
      />
    </section>
  );
}
