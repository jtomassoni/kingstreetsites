import { isPackagingSurplusNote } from "@meals/lib/grocery/packaging";

export type GroceryRecipeLink = {
  recipeId: string;
  mealTitle: string;
};

export type MealTitleRef = {
  title: string;
  recipeId: string | null;
};

const FROM_PREFIX = /^from\s+/i;
const LEFTOVER_OR_COPY = /\s\((leftovers|copy)\)$/i;

/** Meal titles stored in a generated grocery note ("Tacos; Pasta", "From Tacos"). */
export function splitGrocerySourceNote(notes: string): string[] {
  return notes
    .split(";")
    .map((part) => part.trim().replace(FROM_PREFIX, "").trim())
    .filter(Boolean);
}

/**
 * Match a generated source note to recipes on the week.
 * Packaging and Costco callouts are not meal names.
 */
export function recipeLinksFromSourceNote(
  notes: string | null | undefined,
  meals: MealTitleRef[],
): GroceryRecipeLink[] {
  if (!notes?.trim()) return [];
  const text = notes.trim();
  if (/^costco suggestion:/i.test(text)) return [];
  if (isPackagingSurplusNote(text)) return [];

  const recipeByTitle = new Map<string, string>();
  for (const meal of meals) {
    if (!meal.recipeId || recipeByTitle.has(meal.title)) continue;
    recipeByTitle.set(meal.title, meal.recipeId);
  }

  const links: GroceryRecipeLink[] = [];
  const seen = new Set<string>();
  for (const mealTitle of splitGrocerySourceNote(text)) {
    const recipeId = recipeByTitle.get(mealTitle);
    if (!recipeId) continue;
    const key = `${recipeId}\0${mealTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ recipeId, mealTitle });
  }
  return links;
}

/** The note is only the meal titles we already show as edit links. */
export function sourceNoteCoveredByLinks(
  notes: string | null | undefined,
  links: { mealTitle: string }[],
): boolean {
  if (!notes?.trim() || links.length === 0) return false;
  const text = notes.trim();
  if (/^costco suggestion:/i.test(text)) return false;
  if (isPackagingSurplusNote(text)) return false;
  const segments = splitGrocerySourceNote(text);
  if (segments.length === 0) return false;
  const titles = new Set(links.map((link) => link.mealTitle));
  return segments.every((segment) => titles.has(segment));
}

/** One edit button per recipe. Prefer the cooked title over a leftovers copy. */
export function recipeEditTargets(
  links: GroceryRecipeLink[],
): { recipeId: string; label: string }[] {
  const titlesByRecipe = new Map<string, string[]>();
  for (const link of links) {
    const titles = titlesByRecipe.get(link.recipeId) ?? [];
    titles.push(link.mealTitle);
    titlesByRecipe.set(link.recipeId, titles);
  }

  return [...titlesByRecipe.entries()].map(([recipeId, titles]) => {
    const unique = [...new Set(titles)];
    const label =
      unique.find((title) => !LEFTOVER_OR_COPY.test(title)) ?? unique[0]!;
    return { recipeId, label };
  });
}
