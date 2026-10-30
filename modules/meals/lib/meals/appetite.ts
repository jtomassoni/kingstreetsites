/** Recipes are written as one portion; scale up when planning/cooking. */
export const DEFAULT_RECIPE_SERVINGS = 1;

/** Recipe / ideas UI, and the minimum portions a recipe must cover on the week. */
export const DEFAULT_COOK_PORTIONS = 4;
export const MIN_CALENDAR_PORTIONS = DEFAULT_COOK_PORTIONS;

/** @deprecated Yield comes from who is eating at each sitting. */
export const DEFAULT_PORTIONS_EACH = 1;

/** People covered when a sitting is assigned to “both”. */
export const HOUSEHOLD_EATER_COUNT = 2;

/** Portions eaten at one sitting when the meal is for both people. */
export const DEFAULT_HOUSEHOLD_SERVINGS = HOUSEHOLD_EATER_COUNT;

/** Portions eaten at one sitting when the meal is for one person. */
export const DEFAULT_SOLO_SERVINGS = 1;

export function eaterCount(assignedTo: "both" | "specific"): number {
  return assignedTo === "both" ? HOUSEHOLD_EATER_COUNT : 1;
}

/** Portions eaten at one sitting. */
export function sittingServings(
  assignedTo: "both" | "specific" = "both",
): number {
  return eaterCount(assignedTo);
}

export function suggestedHouseholdServings(): number {
  return sittingServings("both");
}

/** @deprecated Prefer sittingServings — per-slot yield, not the recipe display. */
export function plannedMealServings(
  assignedTo: "both" | "specific" = "both",
): number {
  return sittingServings(assignedTo);
}

/** Total portions across calendar sittings (both = 2, one person = 1). */
export function calendarPortions(
  assignedTo: Array<"both" | "specific">,
): number {
  return assignedTo.reduce((sum, scope) => sum + sittingServings(scope), 0);
}

export function meetsMinCalendarPortions(
  assignedTo: Array<"both" | "specific">,
): boolean {
  return calendarPortions(assignedTo) >= MIN_CALENDAR_PORTIONS;
}

export const NOT_ENOUGH_CALENDAR_PORTIONS_ERROR = `Assign at least ${MIN_CALENDAR_PORTIONS} portions on the week. Both is ${sittingServings("both")} portions, one person is ${sittingServings("specific")}.`;

export function totalServingsFromPortionsEach(
  portionsEach: number,
  assignedTo: "both" | "specific",
): number {
  const n =
    Number.isFinite(portionsEach) && portionsEach > 0
      ? portionsEach
      : DEFAULT_PORTIONS_EACH;
  return n * eaterCount(assignedTo);
}

/**
 * Convert stored total yield → UI “portions each”.
 * If Both was saved as exactly 1 (user meant one each), treat that as 1 each —
 * not 0.5 — so shopping gets two portions.
 */
export function portionsEachFromStored(
  storedTotal: number | null | undefined,
  assignedTo: "both" | "specific",
): number {
  const eaters = eaterCount(assignedTo);
  if (storedTotal == null || !(storedTotal > 0)) {
    return DEFAULT_PORTIONS_EACH;
  }
  if (eaters > 1 && storedTotal === 1) {
    return DEFAULT_PORTIONS_EACH;
  }
  return storedTotal / eaters;
}

/** Yield for one sitting; stored total wins when present. */
export function cookYieldServings(
  storedTotal: number | null | undefined,
  assignedTo: "both" | "specific" = "both",
): number {
  if (storedTotal != null && storedTotal > 0) return storedTotal;
  return sittingServings(assignedTo);
}

/** Dietary prefs for AI prompts (no light/heavy portion scaling). */
export function formatHouseholdPrefsForPrompt(
  members: {
    display_name?: string | null;
    dietary_restrictions?: string[] | null;
    ingredient_dislikes?: string[] | null;
    favorite_cuisines?: string[] | null;
  }[],
): string {
  const lines = members.map((m) => ({
    name: m.display_name?.trim() || "Member",
    dietaryRestrictions: m.dietary_restrictions ?? [],
    dislikes: m.ingredient_dislikes ?? [],
    favoriteCuisines: m.favorite_cuisines ?? [],
  }));
  return JSON.stringify({
    members: lines,
    recipeServings: DEFAULT_RECIPE_SERVINGS,
    suggestedPlanServings: DEFAULT_COOK_PORTIONS,
    portionsEachDefault: DEFAULT_PORTIONS_EACH,
    scalingGuidance: [
      `Write every recipe for ${DEFAULT_RECIPE_SERVINGS} serving (one portion). Quantities must match that single portion.`,
      `Recipe and idea views always show ${DEFAULT_COOK_PORTIONS} portions.`,
      `When placing a recipe on the week, assign at least ${MIN_CALENDAR_PORTIONS} portions across sittings: ${sittingServings("both")} if both people eat, ${sittingServings("specific")} if one person eats. Example: two both-sittings or four one-person sittings. Grocery scales from each sitting’s portions.`,
      "Do not scale portions per person appetite.",
    ].join(" "),
  });
}

/** @deprecated Use formatHouseholdPrefsForPrompt */
export const formatAppetiteForPrompt = formatHouseholdPrefsForPrompt;
