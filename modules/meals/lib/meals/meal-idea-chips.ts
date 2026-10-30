export const MEAL_IDEA_VIBE_CHIPS = [
  "Weeknight easy",
  "Comfort food",
  "Light & healthy",
  "One-pan cleanup",
  "Good leftovers",
  "Try something new",
  "Use what's on hand",
  "Impress guests",
] as const;

export const MEAL_IDEA_INGREDIENT_CHIPS = [
  "chicken",
  "ground beef",
  "salmon",
  "shrimp",
  "rice",
  "pasta",
  "potatoes",
  "broccoli",
  "bell peppers",
  "black beans",
  "eggs",
  "tofu",
] as const;

export const MEAL_IDEA_EXCLUSION_CHIPS = [
  "mushrooms",
  "cilantro",
  "shellfish",
  "spicy",
  "dairy",
  "gluten",
  "onions",
  "pork",
] as const;

export const MEAL_IDEA_CUISINE_CHIPS = [
  "Italian",
  "Mexican",
  "Thai",
  "Indian",
  "Japanese",
  "Mediterranean",
  "American",
  "Chinese",
  "Korean",
  "Greek",
] as const;

export function toggleChipSelection(
  selected: string[],
  chip: string,
): string[] {
  return selected.includes(chip)
    ? selected.filter((item) => item !== chip)
    : [...selected, chip];
}

export function parseCustomIngredients(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function mergeIngredientSelections(
  chips: string[],
  customText: string,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...chips, ...parseCustomIngredients(customText)]) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}
