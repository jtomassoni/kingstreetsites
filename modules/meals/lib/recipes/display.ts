import { scaleIngredient } from "@meals/lib/grocery/scaling";
import { DEFAULT_RECIPE_SERVINGS } from "@meals/lib/meals/appetite";

/** Common short culinary units / size words from imports (esp. TheMealDB). */
const SIMPLE_UNIT =
  /^(cups?|tbsps?|tbs?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|liters?|cloves?|slices?|strips?|pinch|pinches|dash|to taste|medium|large|small|can|cans|bunch|handful|sprigs?|whole|clove|head|heads|package|pkg|stick|sticks)$/i;

/** Canonical recipe yield when authoring / missing default_servings. */
export { DEFAULT_RECIPE_SERVINGS };

export function recipeBaseServings(defaultServings: number | null | undefined) {
  return defaultServings && defaultServings > 0
    ? defaultServings
    : DEFAULT_RECIPE_SERVINGS;
}

/** Shared list + cook-view label for a recipe’s yield. */
export function formatPortionsLabel(portions: number) {
  return portions === 1 ? "1 portion" : `${portions} portions`;
}

/** Recipe source metadata we keep in the DB but do not surface in the UI. */
export function isHiddenRecipeSourceType(sourceType: string) {
  return sourceType === "ai";
}

export function formatRecipeSourceDetail(
  sourceType: string,
  sourceName: string | null | undefined,
) {
  if (isHiddenRecipeSourceType(sourceType)) return null;
  if (sourceName === "themealdb") return "TheMealDB";
  const trimmed = sourceName?.trim();
  return trimmed || null;
}

const DESCRIPTIVE_UNIT =
  /\b(cut|into|sliced|diced|chopped|minced|cubed|halved|boneless|skinless|trimmed|beaten|melted|softened|divided|plus|about|fresh|dried)\b/i;

export function formatQuantity(
  quantity: number | null | undefined,
  unit: string | null | undefined,
) {
  if (quantity == null && !unit) return null;
  const qty =
    quantity == null
      ? null
      : Number.isInteger(quantity)
        ? String(quantity)
        : quantity.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return [qty, unit?.trim() || null].filter(Boolean).join(" ");
}

function isSimpleUnit(unit: string) {
  const u = unit.trim();
  if (!u) return true;
  if (SIMPLE_UNIT.test(u)) return true;
  // Short plain unit without prep language (e.g. "Medium", "strips")
  if (u.length <= 12 && !DESCRIPTIVE_UNIT.test(u) && !/\d/.test(u)) return true;
  return false;
}

export type DisplayIngredient = {
  amount: string | null;
  name: string;
  note: string | null;
  optional: boolean;
};

/**
 * Normalize ingredient fields for display: keep short qty/unit as the amount,
 * and move long MealDB-style measure text into a trailing note.
 */
export function toDisplayIngredient(ing: {
  ingredient_name: string;
  quantity: number | null;
  unit: string | null;
  preparation_note: string | null;
  optional: boolean;
}): DisplayIngredient {
  const unit = ing.unit?.trim() || null;
  const notes: string[] = [];

  let amount: string | null;
  if (unit && !isSimpleUnit(unit)) {
    amount = formatQuantity(ing.quantity, null);
    notes.push(unit.replace(/\s+/g, " ").replace(/\s*-\s*/g, "-"));
  } else {
    amount = formatQuantity(ing.quantity, unit);
  }

  if (ing.preparation_note?.trim()) {
    notes.push(ing.preparation_note.trim());
  }

  return {
    amount,
    name: ing.ingredient_name,
    note: notes.length ? notes.join(" · ") : null,
    optional: ing.optional,
  };
}

/** Scale a stored ingredient from the recipe's written yield to a cook portion count. */
export function toScaledDisplayIngredient(
  ing: {
    ingredient_name: string;
    quantity: number | null;
    unit: string | null;
    preparation_note: string | null;
    optional: boolean;
  },
  baseServings: number,
  portions: number,
): DisplayIngredient {
  return toDisplayIngredient({
    ...ing,
    quantity: scaleIngredient(ing.quantity, baseServings, portions),
  });
}

/** Split a blob of instructions into cookable steps for display. */
export function splitInstructionText(text: string): string[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];

  const byLine = text
    .split(/\r?\n+/)
    .map((s) => s.replace(/^\s*(?:step\s*)?\d+[.):]\s*/i, "").trim())
    .filter(Boolean);
  if (byLine.length > 1) {
    return byLine.flatMap((line) => {
      const sentences = splitSentences(line);
      return line.length > 180 && sentences.length > 1 ? sentences : [line];
    });
  }

  const sentences = splitSentences(trimmed);
  if (
    sentences.length > 1 &&
    (trimmed.length >= 100 || sentences.length >= 3)
  ) {
    return sentences;
  }
  return [trimmed];
}

function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+(?=[A-Z])|\s*(?:STEP\s*\d+\s*:?\s*)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [text.trim()];
}

export function expandStepsForDisplay<T extends { id: string; instruction: string }>(
  steps: T[],
): { key: string; instruction: string }[] {
  return steps.flatMap((step) => {
    const parts = splitInstructionText(step.instruction);
    if (parts.length <= 1) {
      return [{ key: step.id, instruction: step.instruction.trim() }];
    }
    return parts.map((instruction, i) => ({
      key: `${step.id}-${i}`,
      instruction,
    }));
  });
}
