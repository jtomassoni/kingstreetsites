import type { RecipeDraft } from "@meals/lib/recipes/recipe-draft";

export type ThemealdbCatalogIndexes = {
  /** normalized title → recipe id */
  byTitleKey: Record<string, string>;
  /** meal type → recipe ids */
  byMealType: Record<string, string[]>;
  /** lowercase cuisine → recipe ids */
  byCuisine: Record<string, string[]>;
  /** token → recipe ids (for multi-word search) */
  titleTokens: Record<string, string[]>;
};

export type ThemealdbCatalogFile = {
  version: number;
  source: "themealdb";
  fetchedAt: string;
  count: number;
  recipes: RecipeDraft[];
  indexes: ThemealdbCatalogIndexes;
};

export function normalizeTitleKey(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function tokenizeTitle(text: string): string[] {
  return normalizeTitleKey(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

export function buildCatalogIndexes(
  recipes: RecipeDraft[],
): ThemealdbCatalogIndexes {
  const byTitleKey: Record<string, string> = {};
  const byMealType: Record<string, string[]> = {};
  const byCuisine: Record<string, string[]> = {};
  const titleTokens: Record<string, string[]> = {};

  for (const recipe of recipes) {
    const titleKey = normalizeTitleKey(recipe.title);
    byTitleKey[titleKey] = recipe.id;

    for (const mealType of recipe.mealTypes) {
      (byMealType[mealType] ??= []).push(recipe.id);
    }

    const cuisine = recipe.cuisine?.trim().toLowerCase();
    if (cuisine) {
      (byCuisine[cuisine] ??= []).push(recipe.id);
    }

    for (const token of tokenizeTitle(recipe.title)) {
      const list = (titleTokens[token] ??= []);
      if (!list.includes(recipe.id)) list.push(recipe.id);
    }
  }

  return { byTitleKey, byMealType, byCuisine, titleTokens };
}

/**
 * Fast search over an in-memory catalog.
 * Exact title first, then token intersection (all query tokens must match).
 */
export function searchCatalogRecipes(
  catalog: ThemealdbCatalogFile,
  query: string,
  limit = 8,
): RecipeDraft[] {
  const q = query.trim();
  if (q.length < 2) return [];

  const byId = new Map(catalog.recipes.map((r) => [r.id, r]));
  const titleKey = normalizeTitleKey(q);
  const exactId = catalog.indexes.byTitleKey[titleKey];
  if (exactId) {
    const exact = byId.get(exactId);
    return exact ? [exact] : [];
  }

  const tokens = tokenizeTitle(q);
  if (!tokens.length) return [];

  let candidateIds: string[] | null = null;
  for (const token of tokens) {
    const ids = catalog.indexes.titleTokens[token] ?? [];
    if (!ids.length) return [];
    if (!candidateIds) {
      candidateIds = [...ids];
    } else {
      const next = new Set(ids);
      candidateIds = candidateIds.filter((id) => next.has(id));
    }
    if (!candidateIds.length) return [];
  }

  const scored = (candidateIds ?? [])
    .map((id) => {
      const recipe = byId.get(id);
      if (!recipe) return null;
      const key = normalizeTitleKey(recipe.title);
      let score = 0;
      if (key.startsWith(titleKey)) score += 100;
      else if (key.includes(titleKey)) score += 60;
      for (const token of tokens) {
        if (key.startsWith(token)) score += 10;
        else if (key.includes(token)) score += 4;
      }
      return { recipe, score };
    })
    .filter((x): x is { recipe: RecipeDraft; score: number } => Boolean(x))
    .sort(
      (a, b) =>
        b.score - a.score ||
        normalizeTitleKey(a.recipe.title).localeCompare(
          normalizeTitleKey(b.recipe.title),
        ),
    );

  return scored.slice(0, Math.max(0, limit)).map((s) => s.recipe);
}
