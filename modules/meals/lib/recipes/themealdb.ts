import type { RecipeDraft } from "@meals/lib/recipes/recipe-draft";
import { splitInstructionText } from "@meals/lib/recipes/display";
import { inferGrocerySection } from "@meals/lib/grocery/sections";

const MEALDB_BASE = "https://www.themealdb.com/api/json/v1/1";

/**
 * TheMealDB FAQ: "no limits / unlimited usage." Free test key `1` is shared,
 * so pace requests (~400ms) and prefer storing recipes in our DB after sync.
 * Full catalog is ~777 meals — letter browse returns full recipes (~26 calls).
 */
export const MEALDB_REQUEST_GAP_MS = 400;
/** Approx size of the public catalog (for docs/scripts). */
export const MEALDB_CATALOG_SIZE_HINT = 750;
export const MEALDB_SYNC_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");


type MealDbMeal = {
  idMeal: string;
  strMeal: string;
  strCategory: string | null;
  strArea: string | null;
  strInstructions: string | null;
  strTags: string | null;
  [key: string]: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mealTypeFromCategory(category: string | null): string[] {
  const c = (category ?? "").toLowerCase();
  if (c.includes("breakfast")) return ["breakfast"];
  if (c.includes("dessert")) return ["other"];
  if (c.includes("side") || c.includes("starter")) return ["lunch", "other"];
  if (
    c.includes("vegetarian") ||
    c.includes("vegan") ||
    c.includes("pasta") ||
    c.includes("miscellaneous")
  ) {
    return ["lunch", "dinner"];
  }
  // Beef, Chicken, Lamb, Pork, Goat, Seafood, etc.
  return ["dinner"];
}

export function isDessertCategory(category: string | null): boolean {
  return (category ?? "").toLowerCase().includes("dessert");
}

function parseMeasure(raw: string | null): {
  quantity: number | null;
  unit: string | null;
} {
  const text = (raw ?? "").trim();
  if (!text) return { quantity: null, unit: null };
  const match = text.match(/^([\d./]+)\s*(.*)$/);
  if (!match) return { quantity: null, unit: text || null };
  const numPart = match[1];
  const unit = match[2]?.trim() || null;
  if (numPart.includes("/")) {
    const [a, b] = numPart.split("/").map(Number);
    if (b) return { quantity: a / b, unit };
  }
  const n = Number(numPart);
  return { quantity: Number.isFinite(n) ? n : null, unit };
}

export function mapMealDbToStarter(
  meal: MealDbMeal,
  forceMealTypes?: string[],
): RecipeDraft {
  const ingredients: RecipeDraft["ingredients"] = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]?.trim();
    if (!name) continue;
    const { quantity, unit } = parseMeasure(meal[`strMeasure${i}`]);
    ingredients.push({
      ingredientName: name,
      quantity,
      unit,
      groceryCategory: inferGrocerySection(name),
    });
  }

  const steps = splitInstructionText(meal.strInstructions ?? "");

  return {
    id: `themealdb-${meal.idMeal}`,
    title: meal.strMeal,
    description: meal.strTags ? meal.strTags.split(",").join(", ") : null,
    cuisine: meal.strArea,
    mealTypes: forceMealTypes?.length
      ? forceMealTypes
      : mealTypeFromCategory(meal.strCategory),
    defaultServings: 4,
    difficulty: "easy",
    ingredients,
    steps: steps.length ? steps : ["Follow classic preparation for this dish."],
  };
}

let lastRequestAt = 0;

async function pacedFetchJson<T>(
  path: string,
  revalidate = 0,
): Promise<T | null> {
  const wait = MEALDB_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);

  let attempt = 0;
  while (attempt < 3) {
    attempt += 1;
    lastRequestAt = Date.now();
    const res = await fetch(`${MEALDB_BASE}${path}`, {
      next: { revalidate },
    });

    if (res.status === 429 || res.status >= 500) {
      await sleep(MEALDB_REQUEST_GAP_MS * attempt * 2);
      continue;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  }

  return null;
}

export async function fetchRandomMealDbRecipes(
  count: number,
  excludeTitles: Iterable<string> = [],
): Promise<RecipeDraft[]> {
  const exclude = new Set(
    [...excludeTitles].map((t) => t.trim().toLowerCase()),
  );
  const collected: RecipeDraft[] = [];
  const seenIds = new Set<string>();
  const attempts = Math.max(count * 4, 8);

  for (let i = 0; i < attempts && collected.length < count; i++) {
    const json = await pacedFetchJson<{ meals: MealDbMeal[] | null }>(
      "/random.php",
    );
    const meal = json?.meals?.[0];
    if (!meal || seenIds.has(meal.idMeal)) continue;
    seenIds.add(meal.idMeal);
    if (exclude.has(meal.strMeal.trim().toLowerCase())) continue;
    const mapped = mapMealDbToStarter(meal);
    if (!mapped.ingredients.length) continue;
    collected.push(mapped);
  }

  return collected;
}

/** Search TheMealDB by dish name (free public API). */
export async function searchMealDbByName(
  query: string,
  limit = 5,
): Promise<RecipeDraft[]> {
  const q = query.trim();
  if (!q) return [];

  const json = await pacedFetchJson<{ meals: MealDbMeal[] | null }>(
    `/search.php?s=${encodeURIComponent(q)}`,
    3600,
  );
  if (!json) {
    throw new Error("TheMealDB search failed");
  }

  const meals = json.meals ?? [];
  const mapped: RecipeDraft[] = [];
  for (const meal of meals) {
    if (mapped.length >= limit) break;
    const recipe = mapMealDbToStarter(meal);
    if (!recipe.ingredients.length) continue;
    mapped.push(recipe);
  }
  return mapped;
}

/**
 * One letter of the catalog. Letter search returns full meal payloads
 * (ingredients + instructions), so ~26 paced calls cover nearly everything.
 */
export async function fetchMealDbLetter(
  letter: string,
  options?: {
    excludeTitles?: Iterable<string>;
    includeDesserts?: boolean;
  },
): Promise<RecipeDraft[]> {
  const normalized = letter.trim().toLowerCase().slice(0, 1);
  if (!/^[a-z]$/.test(normalized)) return [];

  const exclude = new Set(
    [...(options?.excludeTitles ?? [])].map((t) => t.trim().toLowerCase()),
  );
  const includeDesserts = options?.includeDesserts ?? false;

  const json = await pacedFetchJson<{ meals: MealDbMeal[] | null }>(
    `/search.php?f=${normalized}`,
    86400,
  );
  const meals = json?.meals ?? [];
  const collected: RecipeDraft[] = [];
  const seenIds = new Set<string>();

  for (const meal of meals) {
    if (seenIds.has(meal.idMeal)) continue;
    seenIds.add(meal.idMeal);
    if (!includeDesserts && isDessertCategory(meal.strCategory)) continue;
    if (exclude.has(meal.strMeal.trim().toLowerCase())) continue;
    const mapped = mapMealDbToStarter(meal);
    if (!mapped.ingredients.length) continue;
    collected.push(mapped);
  }

  return collected;
}
