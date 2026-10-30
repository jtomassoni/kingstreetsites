import {
  calendarPortions,
  meetsMinCalendarPortions,
  MIN_CALENDAR_PORTIONS,
} from "@meals/lib/meals/appetite";
import { normalizeMealTitle } from "@meals/lib/meals/defaults";
import { mealNeedsMinCalendarPortions } from "@meals/lib/week/fill-slots";
import type { AssignmentScope, PlannedMeal } from "@meals/types/database";

export function assignmentScopeFromMeal(meal: PlannedMeal): AssignmentScope {
  return meal.assigned_to === "both" ? "both" : "specific";
}

export function belowMinPortionsWarning(
  remainingScopes: AssignmentScope[],
): string | null {
  if (remainingScopes.length === 0) return null;
  if (meetsMinCalendarPortions(remainingScopes)) return null;

  const total = calendarPortions(remainingScopes);
  const count = remainingScopes.length;

  if (count === 1) {
    const scope = remainingScopes[0]!;
    if (scope === "specific") {
      return `That leaves a one-person sitting (${total} portion) on the week. Main meals need at least ${MIN_CALENDAR_PORTIONS} portions — add another sitting or assign both people.`;
    }
    return `That leaves only ${total} portions on the week. Main meals need at least ${MIN_CALENDAR_PORTIONS} — add another sitting.`;
  }

  return `That drops to ${total} of ${MIN_CALENDAR_PORTIONS} portions on the week. Add another sitting before saving.`;
}

export function mealBatchKey(meal: PlannedMeal): string | null {
  if (!mealNeedsMinCalendarPortions(meal.meal_type)) return null;
  if (meal.recipe_id) return `recipe:${meal.recipe_id}`;
  return `title:${normalizeMealTitle(meal.title)}`;
}

export function deletePlannedMealPortionWarning(
  meal: PlannedMeal,
  weekMeals: PlannedMeal[],
): string | null {
  const key = mealBatchKey(meal);
  if (!key) return null;

  const batch = weekMeals.filter((candidate) => mealBatchKey(candidate) === key);
  const remaining = batch.filter((candidate) => candidate.id !== meal.id);
  if (remaining.length === 0) return null;

  return belowMinPortionsWarning(remaining.map(assignmentScopeFromMeal));
}

export function deletePlannedMealsPortionWarnings(
  mealIds: string[],
  weekMeals: PlannedMeal[],
): string[] {
  const ids = new Set(mealIds);
  const warnings = new Set<string>();

  for (const meal of weekMeals) {
    if (!ids.has(meal.id)) continue;
    const warning = deletePlannedMealPortionWarning(
      meal,
      weekMeals.filter((candidate) => !ids.has(candidate.id)),
    );
    if (warning) warnings.add(warning);
  }

  return [...warnings];
}
