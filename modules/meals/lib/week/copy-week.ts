export type CopyableDay = {
  id: string;
  sort_order: number;
};

export type CopyableMeal = {
  id: string;
  plan_day_id: string;
  meal_type: string;
  assigned_to: string;
  assigned_to_user_id: string | null;
  title: string;
  recipe_id: string | null;
  recipe_version_id: string | null;
  servings: number | null;
  notes: string | null;
  is_leftovers: boolean;
  leftover_from_meal_id: string | null;
  sort_order: number;
};

export type OccupiedSlot = {
  plan_day_id: string;
  meal_type: string;
};

export type CopiedMealDraft = Omit<CopyableMeal, "id" | "plan_day_id"> & {
  sourceId: string;
  plan_day_id: string;
};

export function occupiedSlotKey(planDayId: string, mealType: string) {
  return `${planDayId}:${mealType}`;
}

/** Copy previous-week meals onto matching weekdays, skipping slots that already have food. */
export function mealsToCopyFromPreviousWeek(input: {
  sourceDays: CopyableDay[];
  sourceMeals: CopyableMeal[];
  targetDays: CopyableDay[];
  occupied: OccupiedSlot[];
}): CopiedMealDraft[] {
  const sourceDayById = new Map(input.sourceDays.map((day) => [day.id, day]));
  const targetBySort = new Map(
    input.targetDays.map((day) => [day.sort_order, day]),
  );
  const occupiedKeys = new Set(
    input.occupied.map((slot) => occupiedSlotKey(slot.plan_day_id, slot.meal_type)),
  );

  const drafts: CopiedMealDraft[] = [];
  const meals = [...input.sourceMeals].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
  );

  for (const meal of meals) {
    const sourceDay = sourceDayById.get(meal.plan_day_id);
    if (!sourceDay) continue;
    const targetDay = targetBySort.get(sourceDay.sort_order);
    if (!targetDay) continue;
    if (occupiedKeys.has(occupiedSlotKey(targetDay.id, meal.meal_type))) {
      continue;
    }

    drafts.push({
      sourceId: meal.id,
      plan_day_id: targetDay.id,
      meal_type: meal.meal_type,
      assigned_to: meal.assigned_to,
      assigned_to_user_id: meal.assigned_to_user_id,
      title: meal.title,
      recipe_id: meal.recipe_id,
      recipe_version_id: meal.recipe_version_id,
      servings: meal.servings,
      notes: meal.notes,
      is_leftovers: meal.is_leftovers,
      leftover_from_meal_id: meal.leftover_from_meal_id,
      sort_order: meal.sort_order,
    });
  }

  return drafts;
}
