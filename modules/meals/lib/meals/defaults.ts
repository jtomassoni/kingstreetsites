import { z } from "zod";
import type { MealType } from "@meals/types/database";
import { plannedMealServings } from "@meals/lib/meals/appetite";

export const MEAL_DEFAULT_SLOTS = ["breakfast", "lunch", "dinner"] as const;
export type MealDefaultSlot = (typeof MEAL_DEFAULT_SLOTS)[number];

/** One option per day of the week. */
export const MAX_DEFAULTS_PER_SLOT = 7;

const optionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  recipeId: z.string().uuid().optional(),
});

export const mealDefaultsSchema = z.object({
  breakfast: z.array(optionSchema).max(MAX_DEFAULTS_PER_SLOT),
  lunch: z.array(optionSchema).max(MAX_DEFAULTS_PER_SLOT),
  dinner: z.array(optionSchema).max(MAX_DEFAULTS_PER_SLOT),
});

export type MealDefaultOption = z.infer<typeof optionSchema>;
export type MealDefaults = z.infer<typeof mealDefaultsSchema>;

export const EMPTY_MEAL_DEFAULTS: MealDefaults = {
  breakfast: [],
  lunch: [],
  dinner: [],
};

function parseSlot(value: unknown): MealDefaultOption[] {
  if (!Array.isArray(value)) return [];
  const parsed = z.array(optionSchema).safeParse(value.slice(0, MAX_DEFAULTS_PER_SLOT));
  return parsed.success ? parsed.data : [];
}

export function parseMealDefaults(value: unknown): MealDefaults {
  if (!value || typeof value !== "object") return EMPTY_MEAL_DEFAULTS;
  const obj = value as Record<string, unknown>;
  return {
    breakfast: parseSlot(obj.breakfast),
    lunch: parseSlot(obj.lunch),
    dinner: parseSlot(obj.dinner),
  };
}

export function hasAnyMealDefaults(defaults: MealDefaults): boolean {
  return MEAL_DEFAULT_SLOTS.some((slot) => defaults[slot].length > 0);
}

export function mealDefaultsIncludeRecipe(
  defaults: MealDefaults,
  recipeId: string,
) {
  return MEAL_DEFAULT_SLOTS.some((slot) =>
    defaults[slot].some((option) => option.recipeId === recipeId),
  );
}

/** Drop a deleted recipe from someone's usual meals. Titles for other meals stay. */
export function omitRecipeFromMealDefaults(
  defaults: MealDefaults,
  recipeId: string,
): MealDefaults {
  const strip = (options: MealDefaultOption[]) =>
    options.filter((option) => option.recipeId !== recipeId);
  return {
    breakfast: strip(defaults.breakfast),
    lunch: strip(defaults.lunch),
    dinner: strip(defaults.dinner),
  };
}

/** True when this person listed 7 meals for breakfast, lunch, and dinner (21 total). */
export function hasFullWeekMenu(defaults: MealDefaults): boolean {
  return MEAL_DEFAULT_SLOTS.every(
    (slot) => defaults[slot].length === MAX_DEFAULTS_PER_SLOT,
  );
}

export function normalizeMealTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function shuffleCopy<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = a;
  }
  return copy;
}

/**
 * Build a week-long menu from up to 7 usual meals.
 * Seven options → shuffle once (each meal one day). Fewer → shuffle and repeat.
 */
export function scheduleDefaultMeals<T>(
  options: T[],
  dayCount: number,
  random: () => number = Math.random,
): T[] {
  if (!options.length || dayCount <= 0) return [];
  const result: T[] = [];
  while (result.length < dayCount) {
    const shuffled = shuffleCopy(options, random);
    for (const item of shuffled) {
      if (result.length >= dayCount) break;
      result.push(item);
    }
  }
  return result;
}

export type DefaultMember = {
  userId: string;
  defaults: MealDefaults;
};

export type ExistingPlannedMeal = {
  plan_day_id: string;
  meal_type: string;
  assigned_to: string;
  assigned_to_user_id: string | null;
};

export type DefaultPlacement = {
  planDayId: string;
  dayDate: string;
  mealType: MealDefaultSlot;
  title: string;
  recipeId?: string;
  assignedTo: "both" | "specific";
  assignedToUserId: string | null;
  servings: number;
};

function personCoveredForSlot(
  meals: ExistingPlannedMeal[],
  planDayId: string,
  mealType: MealType,
  userId: string,
): boolean {
  return meals.some(
    (m) =>
      m.plan_day_id === planDayId &&
      m.meal_type === mealType &&
      (m.assigned_to === "both" || m.assigned_to_user_id === userId),
  );
}

function servingsFor(assignedTo: "both" | "specific") {
  return plannedMealServings(assignedTo);
}

/** Usual meals to place on empty breakfast/lunch/dinner slots. */
export function computeDefaultPlacements(input: {
  days: { id: string; day_date: string }[];
  meals: ExistingPlannedMeal[];
  members: DefaultMember[];
  random?: () => number;
}): DefaultPlacement[] {
  const random = input.random ?? Math.random;
  const days = [...input.days].sort((a, b) =>
    String(a.day_date).localeCompare(String(b.day_date)),
  );
  const members = [...input.members].sort((a, b) => a.userId.localeCompare(b.userId));
  const placements: DefaultPlacement[] = [];

  const weekMenu = new Map<string, Record<MealDefaultSlot, MealDefaultOption[]>>();
  for (const member of members) {
    weekMenu.set(member.userId, {
      breakfast: scheduleDefaultMeals(member.defaults.breakfast, days.length, random),
      lunch: scheduleDefaultMeals(member.defaults.lunch, days.length, random),
      dinner: scheduleDefaultMeals(member.defaults.dinner, days.length, random),
    });
  }

  days.forEach((day, dayIndex) => {
    for (const slot of MEAL_DEFAULT_SLOTS) {
      const picks: { userId: string; title: string; recipeId?: string }[] = [];
      for (const member of members) {
        if (personCoveredForSlot(input.meals, day.id, slot, member.userId)) continue;
        const option = weekMenu.get(member.userId)?.[slot][dayIndex];
        if (!option) continue;
        picks.push({
          userId: member.userId,
          title: option.title.trim(),
          recipeId: option.recipeId,
        });
      }
      if (!picks.length) continue;

      const groups = new Map<
        string,
        { userId: string; title: string; recipeId?: string }[]
      >();
      for (const pick of picks) {
        const key = pick.recipeId
          ? `id:${pick.recipeId}`
          : `title:${normalizeMealTitle(pick.title)}`;
        const group = groups.get(key) ?? [];
        group.push(pick);
        groups.set(key, group);
      }

      for (const group of groups.values()) {
        const title = group[0]!.title;
        const recipeId = group[0]!.recipeId;
        const everyone =
          members.length >= 2 && group.length === members.length;
        if (everyone) {
          placements.push({
            planDayId: day.id,
            dayDate: day.day_date,
            mealType: slot,
            title,
            recipeId,
            assignedTo: "both",
            assignedToUserId: null,
            servings: servingsFor("both"),
          });
          continue;
        }
        for (const pick of group) {
          placements.push({
            planDayId: day.id,
            dayDate: day.day_date,
            mealType: slot,
            title: pick.title,
            recipeId: pick.recipeId,
            assignedTo: "specific",
            assignedToUserId: pick.userId,
            servings: servingsFor("specific"),
          });
        }
      }
    }
  });

  return placements;
}
