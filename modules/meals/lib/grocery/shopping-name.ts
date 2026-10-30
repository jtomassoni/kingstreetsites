/**
 * Shopping-list identity: what you buy, not how a recipe prep-describes it.
 * "minced garlic" / "garlic cloves" → garlic; "garlic powder" stays distinct.
 */

/** Exact aliases after lowercasing / light cleanup. */
const SHOPPING_ALIASES: Record<string, string> = {
  // garlic (fresh)
  "garlic clove": "garlic",
  "garlic cloves": "garlic",
  "clove garlic": "garlic",
  "cloves garlic": "garlic",
  "clove of garlic": "garlic",
  "cloves of garlic": "garlic",
  "head of garlic": "garlic",
  "garlic head": "garlic",
  "garlic bulb": "garlic",
  // butter
  "unsalted butter": "butter",
  "salted butter": "butter",
  "sweet butter": "butter",
  // salt (household usually keeps one)
  "kosher salt": "salt",
  "sea salt": "salt",
  "table salt": "salt",
  "fine salt": "salt",
  "flaky salt": "salt",
  "iodized salt": "salt",
  // shallot typo seen in recipe imports
  challot: "shallot",
  challots: "shallot",
  egg: "eggs",
};

/**
 * Prep / size words that don't change the buy item.
 * Never put product-form words here (powder, paste, flakes, sauce…).
 */
const PREP_WORDS = new Set([
  "minced",
  "chopped",
  "diced",
  "sliced",
  "finely",
  "roughly",
  "coarsely",
  "thinly",
  "crushed",
  "grated",
  "shredded",
  "peeled",
  "trimmed",
  "softened",
  "melted",
  "cubed",
  "halved",
  "quartered",
  "smashed",
  "pressed",
  "divided",
  "optional",
  "fresh",
  "large",
  "small",
  "medium",
  "extra",
  "ripe",
  "cooked",
  "raw",
  "cold",
  "warm",
  "room",
  "temperature",
]);

/** Forms that must stay distinct from the base ingredient. */
const DISTINCT_FORMS = new Set([
  "powder",
  "powdered",
  "salt", // garlic salt ≠ garlic / salt alone handled via multi-word
  "flakes",
  "granules",
  "paste",
  "sauce",
  "juice",
  "oil",
  "extract",
  "stock",
  "broth",
  "seasoning",
  "mix",
  "blend",
  "spread",
  "cream",
]);

const IRREGULAR_PLURALS: Record<string, string> = {
  leaves: "leaf",
  halves: "half",
  potatoes: "potato",
  tomatoes: "tomato",
  heroes: "hero",
};

const UNCOUNTABLE_OR_NOT_PLURAL = new Set([
  "hummus",
  "asparagus",
  "couscous",
  "molasses",
  "oats",
  "grits",
  "chips",
  "fries",
  "noodles",
  "beans",
  "peas",
  "greens",
  "herbs",
  "spices",
  "crumbs",
  "flakes",
  "seeds",
  "nuts",
  "eggs",
]);

function singularizeWord(word: string): string {
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word]!;
  if (UNCOUNTABLE_OR_NOT_PLURAL.has(word)) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (
    word.endsWith("es") &&
    (word.endsWith("ches") ||
      word.endsWith("shes") ||
      word.endsWith("xes") ||
      word.endsWith("zes"))
  ) {
    return word.slice(0, -2);
  }
  if (
    word.endsWith("s") &&
    !word.endsWith("ss") &&
    !word.endsWith("us") &&
    !word.endsWith("is") &&
    word.length > 3
  ) {
    return word.slice(0, -1);
  }
  return word;
}

function singularizeName(name: string): string {
  if (IRREGULAR_PLURALS[name]) return IRREGULAR_PLURALS[name]!;
  if (UNCOUNTABLE_OR_NOT_PLURAL.has(name)) return name;
  const words = name.split(" ");
  const last = words[words.length - 1]!;
  if (UNCOUNTABLE_OR_NOT_PLURAL.has(last)) return name;
  words[words.length - 1] = singularizeWord(last);
  return words.join(" ");
}

/**
 * Canonical grocery identity for consolidation.
 * Prep adjectives collapse; product forms (powder, paste…) do not.
 */
export function canonicalizeShoppingName(name: string): string {
  let n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return n;

  // Drop parenthetical notes: "butter (softened)" → butter
  n = n.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  // "butter, softened" / "garlic, minced" → leading product
  n = n.split(",")[0]!.trim();

  if (SHOPPING_ALIASES[n]) return SHOPPING_ALIASES[n]!;

  const tokens = n.split(" ").filter(Boolean);
  const kept = tokens.filter((t) => !PREP_WORDS.has(t));
  n = (kept.length ? kept : tokens).join(" ").trim();
  n = singularizeName(n);

  if (SHOPPING_ALIASES[n]) return SHOPPING_ALIASES[n]!;

  // "cloves of garlic" after singularize quirks
  n = n
    .replace(/\bcloves?\s+of\s+/g, "")
    .replace(/\bheads?\s+of\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (SHOPPING_ALIASES[n]) return SHOPPING_ALIASES[n]!;
  return n;
}

/** True when the name is a distinct form that should not merge with its base. */
export function isDistinctIngredientForm(canonicalName: string): boolean {
  const parts = canonicalName.split(" ");
  if (parts.length < 2) return false;
  return DISTINCT_FORMS.has(parts[parts.length - 1]!);
}
