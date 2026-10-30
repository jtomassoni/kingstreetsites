import { z } from "zod";
import type { MealType } from "@meals/types/database";

export const MEAL_SLOTS = [
  { value: "breakfast", label: "Breakfast", mealType: "breakfast" as const },
  { value: "lunch", label: "Lunch", mealType: "lunch" as const },
  { value: "dinner", label: "Dinner", mealType: "dinner" as const },
  { value: "snacks", label: "Snacks", mealType: "snack_prep" as const },
] as const;

export type MealSlot = (typeof MEAL_SLOTS)[number]["value"];

export const dayMealNeedsSchema = z.object({
  defaultMeals: z.array(z.enum(["breakfast", "lunch", "dinner", "snacks"])),
  weekdayMeals: z
    .array(z.enum(["breakfast", "lunch", "dinner", "snacks"]))
    .nullable(),
  weekendMeals: z
    .array(z.enum(["breakfast", "lunch", "dinner", "snacks"]))
    .nullable(),
  workingDayMods: z.object({
    add: z.array(z.enum(["breakfast", "lunch", "dinner", "snacks"])),
    remove: z.array(z.enum(["breakfast", "lunch", "dinner", "snacks"])),
  }),
});

export type DayMealNeeds = z.infer<typeof dayMealNeedsSchema>;

export const DEFAULT_DAY_MEAL_NEEDS: DayMealNeeds = {
  defaultMeals: ["breakfast", "lunch", "dinner"],
  weekdayMeals: null,
  weekendMeals: null,
  // Workdays always get a snack slot; per-day tweaks happen on the week page.
  workingDayMods: { add: ["snacks"], remove: [] },
};

export function parseDayMealNeeds(value: unknown): DayMealNeeds {
  const parsed = dayMealNeedsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_DAY_MEAL_NEEDS;
}

export function isWeekendDate(dayDate: string): boolean {
  const day = new Date(`${dayDate}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

/** Base meals for a calendar day before working-day mods. */
export function baseMealsForDay(
  needs: DayMealNeeds,
  dayDate: string,
): MealSlot[] {
  const weekend = isWeekendDate(dayDate);
  if (weekend && needs.weekendMeals) return [...needs.weekendMeals];
  if (!weekend && needs.weekdayMeals) return [...needs.weekdayMeals];
  return [...needs.defaultMeals];
}

/** Final meal slots needed after optional working-day add/remove mods. */
export function resolveMealsForDay(
  needs: DayMealNeeds,
  dayDate: string,
  working: boolean,
): MealSlot[] {
  const base = baseMealsForDay(needs, dayDate);
  if (!working) return base;

  const remove = new Set(needs.workingDayMods.remove);
  const result = base.filter((m) => !remove.has(m));
  for (const slot of needs.workingDayMods.add) {
    if (!result.includes(slot)) result.push(slot);
  }
  return result;
}

export function summarizeWorkingMods(needs: DayMealNeeds): string {
  const { add, remove } = needs.workingDayMods;
  const parts: string[] = [];
  if (add.length) parts.push(`add ${add.length} meal${add.length === 1 ? "" : "s"}`);
  if (remove.length)
    parts.push(`remove ${remove.length} meal${remove.length === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "no changes";
}

export function mealSlotToType(slot: MealSlot): MealType {
  return MEAL_SLOTS.find((s) => s.value === slot)!.mealType;
}

export function mealSlotLabel(slot: MealSlot): string {
  return MEAL_SLOTS.find((s) => s.value === slot)?.label ?? slot;
}

export function mealTypeToSlot(mealType: MealType): MealSlot | null {
  const found = MEAL_SLOTS.find((s) => s.mealType === mealType);
  return found?.value ?? null;
}

/** Notes marker for auto-created working-day placeholder meals. */
export const WORKING_DAY_MEAL_NOTE = "Working day";
