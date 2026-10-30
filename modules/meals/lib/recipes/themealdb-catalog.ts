import catalogJson from "@meals/data/themealdb-catalog.json";
import type { RecipeDraft } from "@meals/lib/recipes/recipe-draft";
import {
  normalizeTitleKey,
  searchCatalogRecipes,
  type ThemealdbCatalogFile,
} from "@meals/lib/recipes/themealdb-catalog-search";

export type {
  ThemealdbCatalogFile,
  ThemealdbCatalogIndexes,
} from "@meals/lib/recipes/themealdb-catalog-search";
export { buildCatalogIndexes } from "@meals/lib/recipes/themealdb-catalog-search";

function loadCatalog(): ThemealdbCatalogFile {
  return catalogJson as ThemealdbCatalogFile;
}

let cachedById: Map<string, RecipeDraft> | null = null;

function byIdMap(): Map<string, RecipeDraft> {
  if (!cachedById) {
    cachedById = new Map(loadCatalog().recipes.map((r) => [r.id, r]));
  }
  return cachedById;
}

export function getThemealdbCatalog(): ThemealdbCatalogFile {
  return loadCatalog();
}

export function getThemealdbRecipeById(id: string): RecipeDraft | null {
  return byIdMap().get(id) ?? null;
}

export function getThemealdbRecipeByTitle(title: string): RecipeDraft | null {
  const catalog = loadCatalog();
  const id = catalog.indexes.byTitleKey[normalizeTitleKey(title)];
  if (!id) return null;
  return byIdMap().get(id) ?? null;
}

export function searchThemealdbCatalog(
  query: string,
  limit = 8,
): RecipeDraft[] {
  return searchCatalogRecipes(loadCatalog(), query, limit);
}

export function listThemealdbByMealType(
  mealType: string,
  limit = 50,
): RecipeDraft[] {
  const catalog = loadCatalog();
  const map = byIdMap();
  const ids = catalog.indexes.byMealType[mealType] ?? [];
  const out: RecipeDraft[] = [];
  for (const id of ids) {
    if (out.length >= limit) break;
    const recipe = map.get(id);
    if (recipe) out.push(recipe);
  }
  return out;
}
