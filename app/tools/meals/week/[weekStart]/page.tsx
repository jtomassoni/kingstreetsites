import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { WeekNavigator } from "@meals/components/week/week-navigator";
import { WeekActions } from "@meals/components/week/week-actions";
import { WeekCalendar } from "@meals/components/week/week-calendar";
import { WeekActivityPanel } from "@meals/components/activity/week-activity-panel";
import { WeekBulkProvider } from "@meals/components/week/week-bulk-context";
import { FillWeekProvider } from "@meals/components/week/fill-week-context";
import { getWeekBundle } from "@meals/actions/plans";
import { listHouseholdRecipeSummaries } from "@meals/actions/recipes";
import {
  parseCalendarDate,
  weekStartForDate,
  weekPathWithView,
} from "@meals/lib/week/calendar-view";
import {
  clampToPlanningWindow,
  formatWeekStart,
  getWeekTitle,
  isInPlanningWindow,
} from "@meals/lib/week/dates";
import { isAiEnabled } from "@meals/lib/env";

function WeekNavigatorFallback() {
  return <div className="h-11 rounded-xl bg-muted/60 md:hidden" aria-hidden />;
}

function WeekCalendarFallback() {
  return (
    <div className="space-y-3 md:hidden">
      <div className="h-11 rounded-xl bg-muted/60" aria-hidden />
      <div className="h-64 rounded-xl bg-muted/40" aria-hidden />
    </div>
  );
}

export default async function WeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ weekStart: string }>;
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { weekStart: rawWeekStart } = await params;
  const { view, date } = await searchParams;

  if (!isInPlanningWindow(rawWeekStart)) {
    redirect(`/tools/meals/week/${clampToPlanningWindow(rawWeekStart)}`);
  }
  const weekStart = clampToPlanningWindow(rawWeekStart);
  const parsedDate = parseCalendarDate(date);
  if (parsedDate) {
    const dateWeek = weekStartForDate(parsedDate);
    if (dateWeek !== weekStart) {
      redirect(
        weekPathWithView(clampToPlanningWindow(dateWeek), {
          view: view === "week" || view === "month" ? view : "day",
          date: parsedDate,
        }),
      );
    }
  }

  const title = getWeekTitle(weekStart);

  const [{ plan, planDays, meals, members }, recipes] = await Promise.all([
    getWeekBundle(weekStart),
    listHouseholdRecipeSummaries(),
  ]);

  const memberOptions = members.map((m) => {
    const p = m.profiles;
    return {
      id: m.user_id,
      name: p?.display_name || p?.email || "Member",
    };
  });

  const nameById = Object.fromEntries(memberOptions.map((m) => [m.id, m.name]));
  const mealCount = meals.length;
  const mealCounts = {
    all: mealCount,
    breakfast: meals.filter((m) => m.meal_type === "breakfast").length,
    lunch: meals.filter((m) => m.meal_type === "lunch").length,
    dinner: meals.filter((m) => m.meal_type === "dinner").length,
    snack_prep: meals.filter((m) => m.meal_type === "snack_prep").length,
  };

  return (
    <WeekBulkProvider>
      <FillWeekProvider planId={plan.id}>
      <div className="week-board">
        <div className="week-board-glow" aria-hidden />

        <div className="week-board-header">
          <div className="hidden md:block">
            <div className="week-board-toolbar">
              <div className="week-board-toolbar-main">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <h1 className="font-display text-[1.75rem] font-semibold leading-none tracking-tight text-foreground">
                      {title}
                    </h1>
                    {mealCount > 0 ? (
                      <p className="rounded-full bg-muted/80 px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                        {mealCount} meal{mealCount === 1 ? "" : "s"}
                      </p>
                    ) : null}
                  </div>
                </div>

                <Suspense fallback={<WeekNavigatorFallback />}>
                  <WeekNavigator weekStart={weekStart} />
                </Suspense>
              </div>

              <div className="week-board-toolbar-actions">
                <WeekActions
                  planId={plan.id}
                  weekStart={weekStart}
                  aiEnabled={isAiEnabled()}
                  members={memberOptions}
                  days={planDays.map((d) => ({
                    id: d.id,
                    day_date: d.day_date,
                  }))}
                  mealCounts={mealCounts}
                />
              </div>
            </div>
          </div>

          {recipes.length === 0 ? (
            <p className="mt-3 hidden rounded-xl border border-dashed border-primary/25 bg-primary/5 px-3 py-2 text-sm text-muted-foreground md:block">
              Your recipe library is empty.{" "}
              <Link
                href="/tools/meals/recipes"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Add recipes
              </Link>{" "}
              before scheduling meals.
            </p>
          ) : null}
        </div>

        <Suspense fallback={<WeekCalendarFallback />}>
          <WeekCalendar
            planId={plan.id}
            weekStart={weekStart}
            days={planDays}
            meals={meals}
            members={memberOptions}
            aiEnabled={isAiEnabled()}
            recipes={recipes.map((r) => ({
              id: r.id,
              title: r.title,
              mealTypes: r.meal_types ?? [],
            }))}
            nameById={nameById}
            mobilePlanningSheet={
              <Suspense fallback={<WeekNavigatorFallback />}>
                <WeekNavigator weekStart={weekStart} />
              </Suspense>
            }
            mobilePlanningActions={
              <WeekActions
                planId={plan.id}
                weekStart={weekStart}
                aiEnabled={isAiEnabled()}
                members={memberOptions}
                days={planDays.map((d) => ({
                  id: d.id,
                  day_date: d.day_date,
                }))}
                mealCounts={mealCounts}
              />
            }
          />
        </Suspense>

        <WeekActivityPanel weeklyPlanId={plan.id} />
      </div>
      </FillWeekProvider>
    </WeekBulkProvider>
  );
}
