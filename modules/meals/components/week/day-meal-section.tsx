"use client";

import { format } from "date-fns";
import { CalendarMealChip } from "@meals/components/week/calendar-meal-chip";
import { AddMealDialog } from "@meals/components/week/add-meal-dialog";
import {
  fillWeekSlotDimmed,
  proposalSlotKey,
  useFillWeekOptional,
} from "@meals/components/week/fill-week-context";
import { FillWeekProposalChip } from "@meals/components/week/fill-week-proposal-chip";
import { useWeekBulk } from "@meals/components/week/week-bulk-context";
import type { MealType, PlanDay, PlannedMeal } from "@meals/types/database";
import { toDateOnlyString } from "@meals/lib/dates";
import { cn } from "@meals/lib/utils";

export const MEAL_ROWS: {
  type: MealType;
  label: string;
  rail: string;
  wash: string;
}[] = [
  {
    type: "breakfast",
    label: "Breakfast",
    rail: "text-[var(--meal-breakfast-rail)]",
    wash: "bg-[var(--wash-breakfast)]/35",
  },
  {
    type: "lunch",
    label: "Lunch",
    rail: "text-[var(--meal-lunch-rail)]",
    wash: "bg-[var(--wash-lunch)]/40",
  },
  {
    type: "dinner",
    label: "Dinner",
    rail: "text-[var(--meal-dinner-rail)]",
    wash: "bg-[var(--wash-dinner)]/35",
  },
  {
    type: "snack_prep",
    label: "Snack",
    rail: "text-[var(--meal-snack-rail)]",
    wash: "bg-[var(--wash-snack)]/30",
  },
];

type MemberOption = { id: string; name: string };
type RecipeOption = { id: string; title: string; mealTypes: string[] };
type DayOption = { id: string; day_date: string };

function mealsForSlot(
  meals: PlannedMeal[],
  planDayId: string,
  mealType: MealType,
) {
  return meals
    .filter((m) => m.plan_day_id === planDayId && m.meal_type === mealType)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function mealIdsForDay(meals: PlannedMeal[], planDayId: string) {
  return meals.filter((m) => m.plan_day_id === planDayId).map((m) => m.id);
}

export function DayMealSection({
  day,
  planId,
  visibleMeals,
  members,
  recipes,
  nameById,
  aiEnabled,
  dayOptions,
  today,
  sectionRef,
  className,
  compactHeader = false,
  onMealRemoved,
}: {
  day: PlanDay;
  planId: string;
  visibleMeals: PlannedMeal[];
  members: MemberOption[];
  recipes: RecipeOption[];
  nameById: Record<string, string>;
  aiEnabled: boolean;
  dayOptions: DayOption[];
  today: string;
  sectionRef?: (el: HTMLElement | null) => void;
  className?: string;
  compactHeader?: boolean;
  onMealRemoved: (mealId: string) => void;
}) {
  const { selecting, toggleGroup } = useWeekBulk();
  const fillWeek = useFillWeekOptional();
  const fillReviewing = fillWeek?.reviewing ?? false;
  const dayDate = toDateOnlyString(day.day_date);
  const date = new Date(`${dayDate}T12:00:00`);
  const isToday = dayDate === today;
  const isWork = day.needs_portable_snacks || day.profile_type === "workday";
  const dayLabel = format(date, "EEE MMM d");
  const dayMealIds = mealIdsForDay(visibleMeals, day.id);

  return (
    <section
      data-day-id={day.id}
      ref={sectionRef}
      className={cn(
        "scroll-mt-[7.5rem] px-3 py-3",
        compactHeader && "px-2 py-2 sm:px-3",
        isToday && "bg-primary/[0.04]",
        className,
      )}
    >
      {compactHeader ? null : (
      <header
        className={cn(
          "mb-2.5 flex items-center justify-between gap-2",
          fillWeekSlotDimmed(fillReviewing),
        )}
      >
        {selecting && dayMealIds.length ? (
          <button
            type="button"
            onClick={() => toggleGroup(dayMealIds)}
            className="flex min-w-0 items-center gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Select meals on ${format(date, "EEEE")}`}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold tabular-nums",
                isToday
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                  : "bg-secondary text-foreground",
              )}
            >
              {format(date, "d")}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block text-sm font-semibold",
                  isToday ? "text-primary" : "text-foreground",
                )}
              >
                {format(date, "EEEE")}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {format(date, "MMM d")}
                {isWork ? " · Work" : ""}
                {" · tap to select"}
              </span>
            </span>
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold tabular-nums",
                isToday
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                  : "bg-secondary text-foreground",
              )}
            >
              {format(date, "d")}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold",
                  isToday ? "text-primary" : "text-foreground",
                )}
              >
                {format(date, "EEEE")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {format(date, "MMM d")}
                {isWork ? " · Work" : ""}
              </p>
            </div>
          </div>
        )}
      </header>
      )}

      <div className={cn("space-y-2", compactHeader && "space-y-1.5")}>
        {MEAL_ROWS.map((row) => {
          const cellMeals = mealsForSlot(visibleMeals, day.id, row.type);
          const filled = cellMeals.length > 0;
          const proposal = fillReviewing
            ? (fillWeek?.proposalBySlot.get(
                proposalSlotKey(day.id, row.type),
              ) ?? null)
            : null;
          const hasProposal = Boolean(proposal);

          return (
            <div
              key={`${day.id}-${row.type}`}
              className={cn(
                "rounded-xl border p-2 transition-colors",
                filled
                  ? "border-border/55 bg-card/95"
                  : cn("border-transparent", row.wash),
                hasProposal && fillReviewing && "fill-week-interactive relative z-[1] ring-1 ring-inset ring-primary/20",
                fillReviewing && !hasProposal && fillWeekSlotDimmed(true),
              )}
            >
              {selecting && cellMeals.length > 0 && !fillReviewing ? (
                <button
                  type="button"
                  className={cn(
                    "mb-1.5 text-[11px] font-semibold uppercase tracking-wide underline-offset-2 hover:underline",
                    row.rail,
                  )}
                  onClick={() => toggleGroup(cellMeals.map((meal) => meal.id))}
                >
                  {row.label}
                </button>
              ) : (
                <p
                  className={cn(
                    "mb-1.5 text-[11px] font-semibold uppercase tracking-wide",
                    row.rail,
                  )}
                >
                  {row.label}
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                {filled ? (
                  <div
                    className={cn(
                      "space-y-1.5",
                      selecting && "space-y-2",
                      fillWeekSlotDimmed(fillReviewing),
                    )}
                  >
                    {cellMeals.map((meal) => (
                      <CalendarMealChip
                        key={meal.id}
                        meal={meal}
                        members={members}
                        weekMeals={visibleMeals}
                        aiEnabled={aiEnabled}
                        onRemoved={onMealRemoved}
                        memberName={
                          meal.assigned_to_user_id
                            ? nameById[meal.assigned_to_user_id]
                            : null
                        }
                      />
                    ))}
                  </div>
                ) : null}
                {hasProposal && proposal && fillWeek ? (
                  <FillWeekProposalChip
                    proposal={proposal}
                    disabled={fillWeek.pending}
                    onAccept={() => fillWeek.acceptProposal(proposal)}
                    onSuggestNew={() => fillWeek.suggestNew(proposal)}
                  />
                ) : null}
                {selecting || fillReviewing ? null : (
                  <AddMealDialog
                    planDayId={day.id}
                    weeklyPlanId={planId}
                    members={members}
                    recipes={recipes}
                    meals={visibleMeals}
                    mealType={row.type}
                    dayLabel={dayLabel}
                    slotLabel={row.label}
                    days={dayOptions}
                    variant={filled ? "another" : "empty"}
                    triggerClassName={
                      filled ? "week-slot-add-another" : "week-slot-empty"
                    }
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function mealIdsForDayExport(meals: PlannedMeal[], planDayId: string) {
  return mealIdsForDay(meals, planDayId);
}
