import {
  meetsMinCalendarPortions,
  sittingServings,
} from "@meals/lib/meals/appetite";
import {
  calendarSlotKey,
  datesAreConsecutive,
  mealNeedsMinCalendarPortions,
  type PlannedMealLike,
} from "@meals/lib/week/fill-slots";
import { toDateOnlyString } from "@meals/lib/dates";
import type { AssignmentScope, MealType } from "@meals/types/database";

type DayLike = { id: string; day_date: string };

export type SittingDraftLike = {
  planDayId: string;
  mealType: MealType;
  assigned: AssignmentScope | string;
};

export function occupiedCalendarSlotKeys(
  meals: PlannedMealLike[],
): Set<string> {
  return new Set(
    meals.map((meal) => calendarSlotKey(meal.plan_day_id, meal.meal_type)),
  );
}

function sittingDayDates(
  days: DayLike[],
  sittingPlanDayIds: string[],
): string[] {
  return sittingPlanDayIds
    .map((planDayId) => days.find((day) => day.id === planDayId))
    .filter(Boolean)
    .map((day) => toDateOnlyString(day!.day_date));
}

function isConsecutiveToExistingSitting(
  dayDate: string,
  existingSittingDayDates: string[],
): boolean {
  return existingSittingDayDates.some((sittingDate) =>
    datesAreConsecutive(dayDate, sittingDate),
  );
}

/** Nearest open slot for another sitting — never on a calendar day adjacent to an existing one. */
export function suggestAdditionalSittingSlot(input: {
  days: DayLike[];
  mealType: MealType;
  occupied: Set<string>;
  existingSittingPlanDayIds: string[];
  preferPlanDayId: string;
}): { planDayId: string; mealType: MealType } | null {
  const sorted = [...input.days].sort((a, b) =>
    toDateOnlyString(a.day_date).localeCompare(toDateOnlyString(b.day_date)),
  );
  const originIndex = sorted.findIndex((day) => day.id === input.preferPlanDayId);
  if (originIndex < 0) return null;

  const existingDates = sittingDayDates(
    input.days,
    input.existingSittingPlanDayIds,
  );

  const candidates = sorted
    .map((day, index) => ({ day, index, distance: Math.abs(index - originIndex) }))
    .filter(({ day, distance }) => {
      if (distance === 0) return false;
      const key = calendarSlotKey(day.id, input.mealType);
      if (input.occupied.has(key)) return false;
      const dayDate = toDateOnlyString(day.day_date);
      return !isConsecutiveToExistingSitting(dayDate, existingDates);
    })
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      const aForward = a.index > originIndex ? 0 : 1;
      const bForward = b.index > originIndex ? 0 : 1;
      if (aForward !== bForward) return aForward - bForward;
      return b.index - a.index;
    });

  const best = candidates[0];
  return best ? { planDayId: best.day.id, mealType: input.mealType } : null;
}

/** Default sittings for add-meal: origin slot plus enough extras to meet portion minimum. */
export function buildDefaultMealSittings(input: {
  planDayId: string;
  mealType: MealType;
  days: DayLike[];
  occupied: Set<string>;
}): SittingDraftLike[] {
  const first: SittingDraftLike = {
    planDayId: input.planDayId,
    mealType: input.mealType,
    assigned: "both",
  };
  if (!mealNeedsMinCalendarPortions(input.mealType)) return [first];

  const sittings: SittingDraftLike[] = [first];
  const used = new Set(input.occupied);
  used.add(calendarSlotKey(input.planDayId, input.mealType));
  const scopes: AssignmentScope[] = ["both"];

  while (!meetsMinCalendarPortions(scopes)) {
    const next = suggestAdditionalSittingSlot({
      days: input.days,
      mealType: input.mealType,
      occupied: used,
      existingSittingPlanDayIds: sittings.map((sitting) => sitting.planDayId),
      preferPlanDayId: input.planDayId,
    });
    if (!next) break;
    used.add(calendarSlotKey(next.planDayId, next.mealType));
    sittings.push({
      planDayId: next.planDayId,
      mealType: next.mealType,
      assigned: "both",
    });
    scopes.push("both");
  }

  return sittings;
}

export function sittingScopes(
  sittings: SittingDraftLike[],
): AssignmentScope[] {
  return sittings.map((sitting) =>
    sitting.assigned === "both" ? "both" : "specific",
  );
}

export function totalSittingPortions(sittings: SittingDraftLike[]): number {
  return sittingScopes(sittings).reduce(
    (sum, scope) => sum + sittingServings(scope),
    0,
  );
}
