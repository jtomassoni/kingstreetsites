/** Score how well a recipe title matches a captured idea (higher is better). */
export function rankTitleMatch(query: string, title: string): number {
  const q = query.trim().toLowerCase();
  const t = title.trim().toLowerCase();
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  const qTokens = q.split(/\s+/).filter(Boolean);
  if (!qTokens.length) return 0;
  const hit = qTokens.filter((tok) => t.includes(tok)).length;
  if (hit === qTokens.length) return 50;
  if (hit >= Math.ceil(qTokens.length * 0.6)) return 30;
  return 0;
}

export type TitleMatchKind = "exact" | "similar" | "none";

const MODIFIER_TOKENS = new Set([
  "a",
  "an",
  "and",
  "authentic",
  "best",
  "cheesy",
  "classic",
  "copycat",
  "creamy",
  "crispy",
  "easy",
  "for",
  "homemade",
  "in",
  "loaded",
  "my",
  "of",
  "on",
  "or",
  "our",
  "quick",
  "recipe",
  "recipes",
  "simple",
  "spicy",
  "style",
  "the",
  "weeknight",
  "with",
]);

/** Too generic to count as “the same dish” on their own. */
const GENERIC_TOKENS = new Set([
  "beef",
  "bowl",
  "bowls",
  "burger",
  "burgers",
  "chicken",
  "curry",
  "egg",
  "eggs",
  "fish",
  "lamb",
  "noodles",
  "pasta",
  "pizza",
  "pork",
  "rice",
  "salad",
  "salmon",
  "sandwich",
  "sandwiches",
  "shrimp",
  "soup",
  "stir",
  "taco",
  "tacos",
  "tofu",
  "turkey",
  "wrap",
  "wraps",
]);

export function normalizeTitleKey(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeTitle(title: string): string[] {
  return normalizeTitleKey(title)
    .split(" ")
    .filter((tok) => tok.length >= 2);
}

function isModifierToken(token: string) {
  return MODIFIER_TOKENS.has(token);
}

function isDistinctiveToken(token: string) {
  return (
    token.length >= 4 &&
    !MODIFIER_TOKENS.has(token) &&
    !GENERIC_TOKENS.has(token)
  );
}

function extraTokens(longer: string[], shorter: string[]) {
  const short = new Set(shorter);
  return longer.filter((tok) => !short.has(tok));
}

function containsAll(haystack: string[], needles: string[]) {
  if (!needles.length) return false;
  const set = new Set(haystack);
  return needles.every((tok) => set.has(tok));
}

/**
 * Exact = same dish (including easy/creamy/homemade prefixes).
 * Similar = shared distinctive word (birria tacos vs birria ramen) or
 * a more-specific/more-generic variant (tacos vs birria tacos).
 */
export function classifyTitleMatch(query: string, title: string): TitleMatchKind {
  const qTokens = tokenizeTitle(query);
  const tTokens = tokenizeTitle(title);
  if (!qTokens.length || !tTokens.length) return "none";

  const qKey = qTokens.join(" ");
  const tKey = tTokens.join(" ");
  if (qKey === tKey) return "exact";

  if (containsAll(tTokens, qTokens)) {
    const extras = extraTokens(tTokens, qTokens);
    return extras.every(isModifierToken) ? "exact" : "similar";
  }

  if (containsAll(qTokens, tTokens)) {
    const extras = extraTokens(qTokens, tTokens);
    return extras.every(isModifierToken) ? "exact" : "similar";
  }

  const qDist = qTokens.filter(isDistinctiveToken);
  const tDist = tTokens.filter(isDistinctiveToken);
  if (qDist.length && tDist.length) {
    const tSet = new Set(tDist);
    if (qDist.some((tok) => tSet.has(tok))) return "similar";
  }

  const shared = qTokens.filter((tok) => tTokens.includes(tok));
  const union = new Set([...qTokens, ...tTokens]).size;
  if (union > 0 && shared.length / union >= 0.5) return "similar";

  return "none";
}

export type LibraryMatch<T extends { title: string }> = {
  exact: T | null;
  similar: T[];
};

const SIMILAR_LIMIT = 5;

/** Pick an exact household recipe, or similar titles that need confirmation. */
export function matchIdeaToLibrary<T extends { title: string }>(
  idea: string,
  recipes: T[],
): LibraryMatch<T> {
  const ranked = recipes
    .map((recipe) => ({
      recipe,
      kind: classifyTitleMatch(idea, recipe.title),
      score: rankTitleMatch(idea, recipe.title),
    }))
    .filter((row) => row.kind !== "none")
    .sort(
      (a, b) =>
        b.score - a.score || a.recipe.title.localeCompare(b.recipe.title),
    );

  const exact = ranked.find((row) => row.kind === "exact")?.recipe ?? null;
  if (exact) {
    return { exact, similar: [] };
  }

  const similar = ranked
    .filter((row) => row.kind === "similar")
    .slice(0, SIMILAR_LIMIT)
    .map((row) => row.recipe);

  return { exact: null, similar };
}
