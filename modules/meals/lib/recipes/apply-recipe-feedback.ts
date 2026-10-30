import type { AiRecipe } from "@meals/lib/ai/schemas";
import type { RecipeParseContext } from "@meals/lib/recipes/parse-recipe-request";

const STOP_WORDS = new Set([
  "fresh",
  "ground",
  "large",
  "small",
  "sliced",
  "chopped",
  "cooked",
  "white",
  "black",
  "red",
  "green",
  "dried",
  "minced",
  "diced",
  "warm",
  "extra",
  "whole",
  "raw",
]);

const METHOD_FEEDBACK =
  /\b(minutes?|hours?|oven|bake|simmer|boil|sear|grill|temperature|degrees?|stir|steps?|instructions?|method|longer|shorter)\b/i;

const REMOVAL_CUE =
  /\b(instead of|rather than|remove|without|omit|skip|drop|leave out|no)\b/i;

type ContextIngredient = RecipeParseContext["ingredients"][number];

function norm(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokens(name: string) {
  return norm(name)
    .split(" ")
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

function namesMatch(a: string, b: string) {
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [shorter, longer] =
    left.length <= right.length ? [left, right] : [right, left];
  if (!longer.includes(shorter)) return false;
  const extra = longer
    .replace(shorter, " ")
    .split(" ")
    .map((word) => word.trim())
    .filter(Boolean);
  return extra.every((word) => STOP_WORDS.has(word) || word.length <= 2);
}

function textMentions(text: string, name: string) {
  const lower = text.toLowerCase();
  const normalized = norm(name);
  if (normalized && lower.includes(normalized)) return true;
  return tokens(name).some((word) => new RegExp(`\\b${word}\\b`, "i").test(text));
}

function parseQuantity(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** A multi-line recipe paste should replace the form. A short note should not. */
export function looksLikeReplacementRecipe(text: string) {
  const trimmed = text.trim();
  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 4) return true;
  const quantities = trimmed.match(
    /\b\d+(?:[./]\d+)?\s*(?:cups?|tbsp|tsp|teaspoons?|tablespoons?|oz|ounces?|lb|lbs|pounds?|g|kg|ml|cloves?)\b/gi,
  );
  if ((quantities?.length ?? 0) >= 3) return true;
  return trimmed.length > 500 && lines.length >= 2;
}

function userSpecifiesAmount(text: string, ingredientName: string) {
  if (!textMentions(text, ingredientName)) return false;
  return tokens(ingredientName).concat(norm(ingredientName)).some((token) => {
    if (!token) return false;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:\\d[^\\n]{0,24}\\b${escaped}\\b|\\b${escaped}\\b[^\\n]{0,24}\\d)`,
      "i",
    ).test(text);
  });
}

function removedIngredients(text: string, current: ContextIngredient[]) {
  if (!REMOVAL_CUE.test(text)) return [];
  const instead = text.split(/instead of|rather than/i);
  const scope = instead.length > 1 ? instead.slice(1).join(" ") : text;
  return current.filter((item) => textMentions(scope, item.ingredientName));
}

function toAiIngredient(
  item: ContextIngredient,
): AiRecipe["ingredients"][number] {
  return {
    ingredientName: item.ingredientName.trim(),
    quantity: parseQuantity(item.quantity),
    unit: item.unit?.trim() || null,
    preparationNote: item.preparationNote?.trim() || null,
    groceryCategory: item.groceryCategory?.trim() || null,
  };
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function replaceName(instruction: string, from: string, to: string) {
  const normalized = norm(from);
  if (!normalized) return instruction;
  const pattern = new RegExp(
    normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "ig",
  );
  const replaced = instruction.replace(pattern, to);
  if (replaced !== instruction) return replaced;
  const word = tokens(from)[0];
  if (!word) return instruction;
  return instruction.replace(new RegExp(`\\b${word}\\b`, "ig"), to);
}

function difficultyOf(value: string | null | undefined): AiRecipe["difficulty"] {
  if (value === "easy" || value === "medium" || value === "hard") return value;
  return null;
}

/**
 * Keep the recipe already on the form when the paste is a note.
 * The model still interprets the note; this drops unrequested rewrites.
 */
export function applyRecipeFeedback(
  current: RecipeParseContext,
  parsed: AiRecipe,
  userText: string,
): AiRecipe {
  if (looksLikeReplacementRecipe(userText)) return parsed;

  const currentIngredients = current.ingredients.filter((item) =>
    item.ingredientName.trim(),
  );
  const removed = removedIngredients(userText, currentIngredients);
  const kept = currentIngredients.filter(
    (item) => !removed.some((gone) => namesMatch(gone.ingredientName, item.ingredientName)),
  );

  const ingredients = kept.map((item) => {
    const update = parsed.ingredients.find((candidate) =>
      namesMatch(candidate.ingredientName, item.ingredientName),
    );
    const base = toAiIngredient(item);
    if (!update || !userSpecifiesAmount(userText, item.ingredientName)) return base;
    return {
      ...base,
      quantity: update.quantity ?? base.quantity,
      unit: update.unit ?? base.unit,
    };
  });

  const added = parsed.ingredients.filter(
    (item) =>
      textMentions(userText, item.ingredientName) &&
      !currentIngredients.some((existing) =>
        namesMatch(existing.ingredientName, item.ingredientName),
      ),
  );
  ingredients.push(...added);

  const currentSteps = current.steps
    .map((step) => step.instruction.trim())
    .filter(Boolean);
  let steps = METHOD_FEEDBACK.test(userText)
    ? parsed.steps.map((step) => step.instruction.trim()).filter(Boolean)
    : [...currentSteps];

  if (!steps.length) {
    steps = parsed.steps.map((step) => step.instruction.trim()).filter(Boolean);
  }

  const addedNames = added.map((item) => item.ingredientName.trim()).filter(Boolean);
  if (!METHOD_FEEDBACK.test(userText) && removed.length === 1 && addedNames.length) {
    const replacement = joinNames(addedNames);
    steps = steps.map((instruction) =>
      replaceName(instruction, removed[0]!.ingredientName, replacement),
    );
  }

  const missing = addedNames.filter(
    (name) => !steps.some((instruction) => textMentions(instruction, name)),
  );
  if (missing.length && steps.length && !METHOD_FEEDBACK.test(userText)) {
    const last = steps.length - 1;
    steps[last] = `${steps[last]!.replace(/[.\s]+$/, "")}. Add ${joinNames(missing)}.`;
  }

  const servings = Number(current.defaultServings);
  return {
    ...parsed,
    title: current.title.trim() || parsed.title,
    description: current.description?.trim() || parsed.description || null,
    cuisine: current.cuisine?.trim() || parsed.cuisine || null,
    difficulty: difficultyOf(current.difficulty) ?? parsed.difficulty ?? null,
    defaultServings:
      Number.isFinite(servings) && servings > 0 ? servings : parsed.defaultServings,
    ingredients: ingredients.length ? ingredients : parsed.ingredients,
    steps: steps.length
      ? steps.map((instruction) => ({ instruction }))
      : parsed.steps,
  };
}
