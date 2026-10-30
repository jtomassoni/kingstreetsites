export const AI_LIMITS = {
  maxMealsPerRequest: 7,
  defaultMealsPerRequest: 1,
  cooldownMs: 4_000,
  pendingStaleMs: 90_000,
  requestTimeoutMs: 45_000,
  maxNotesChars: 500,
  maxListItemChars: 80,
  maxListItems: 40,
  maxUserPayloadChars: 8_000,
  ideasMaxOutputTokens: 1_600,
  recipeMaxOutputTokens: 2_800,
  ideasConservativeInputTokens: 3_500,
  recipeConservativeInputTokens: 3_000,
} as const;

export type GenerationOperation =
  | "generate_meal_ideas"
  | "generate_full_recipe"
  | "generate_recipe_from_search";

export function clampMealCount(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : AI_LIMITS.defaultMealsPerRequest;
  if (!Number.isFinite(n)) return AI_LIMITS.defaultMealsPerRequest;
  return Math.min(AI_LIMITS.maxMealsPerRequest, Math.max(1, Math.floor(n)));
}

export function boundText(
  value: string | null | undefined,
  max: number,
): string {
  return (value ?? "").trim().slice(0, max);
}

export function boundStringList(
  values: unknown,
  maxItems = AI_LIMITS.maxListItems,
  maxItemChars = AI_LIMITS.maxListItemChars,
): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const item of values) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, maxItemChars);
    if (!trimmed) continue;
    out.push(trimmed);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function maxOutputTokensFor(operation: GenerationOperation): number {
  return operation === "generate_meal_ideas"
    ? AI_LIMITS.ideasMaxOutputTokens
    : AI_LIMITS.recipeMaxOutputTokens;
}

export function conservativeInputTokensFor(
  operation: GenerationOperation,
): number {
  return operation === "generate_meal_ideas"
    ? AI_LIMITS.ideasConservativeInputTokens
    : AI_LIMITS.recipeConservativeInputTokens;
}
