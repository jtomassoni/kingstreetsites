export const GROCERY_SECTIONS = [
  { id: "produce", label: "Produce" },
  { id: "meat_seafood", label: "Meat & Seafood" },
  { id: "dairy", label: "Dairy & Eggs" },
  { id: "bakery", label: "Bakery" },
  { id: "pantry", label: "Pantry" },
  { id: "frozen", label: "Frozen" },
  { id: "beverages", label: "Beverages" },
  { id: "snacks", label: "Snacks" },
  { id: "household", label: "Household" },
  { id: "other", label: "Other" },
] as const;

export type GrocerySectionId = (typeof GROCERY_SECTIONS)[number]["id"];

const PRODUCE_KEYWORDS = [
  "apple",
  "apricot",
  "arugula",
  "asparagus",
  "avocado",
  "banana",
  "basil",
  "bell pepper",
  "berry",
  "blackberry",
  "blueberry",
  "bok choy",
  "broccoli",
  "brussels",
  "cabbage",
  "carrot",
  "cauliflower",
  "celery",
  "cherry",
  "chili",
  "chive",
  "cilantro",
  "coconut",
  "corn",
  "cranberry",
  "cucumber",
  "dill",
  "eggplant",
  "fruit",
  "garlic",
  "ginger",
  "grape",
  "grapefruit",
  "green bean",
  "green onion",
  "herb",
  "jalapeno",
  "kale",
  "kiwi",
  "leek",
  "lemon",
  "lettuce",
  "lime",
  "mango",
  "melon",
  "mint",
  "mushroom",
  "nectarine",
  "onion",
  "orange",
  "parsley",
  "peach",
  "pear",
  "pepper",
  "pineapple",
  "plum",
  "potato",
  "produce",
  "radish",
  "raspberry",
  "romaine",
  "rosemary",
  "salad",
  "scallion",
  "shallot",
  "challot", // common misspelling of shallot
  "spinach",
  "squash",
  "strawberry",
  "sweet potato",
  "thyme",
  "tomato",
  "vegetable",
  "zucchini",
];

const MEAT_SEAFOOD_KEYWORDS = [
  "beef",
  "chicken",
  "pork",
  "turkey",
  "lamb",
  "bacon",
  "sausage",
  "ham",
  "salmon",
  "shrimp",
  "fish",
  "tuna",
  "cod",
  "steak",
  "ground beef",
  "ground turkey",
  "meat",
  "seafood",
];

const DAIRY_KEYWORDS = [
  "milk",
  "cheese",
  "butter",
  "cream",
  "yogurt",
  "egg",
  "sour cream",
  "cream cheese",
  "parmesan",
  "mozzarella",
  "cheddar",
  "hummus",
  "half and half",
];

const BAKERY_KEYWORDS = [
  "bread",
  "bun",
  "roll",
  "tortilla",
  "bagel",
  "pita",
  "croissant",
  "pastry",
  "puff pastry",
  "dough",
  "english muffin",
  "brioche",
];

const PANTRY_KEYWORDS = [
  "rice",
  "pasta",
  "macaroni",
  "spaghetti",
  "penne",
  "linguine",
  "fettuccine",
  "fettuccini",
  "rigatoni",
  "orzo",
  "noodle",
  "lasagna",
  "lasagne",
  "flour",
  "sugar",
  "salt",
  "pepper",
  "oil",
  "vinegar",
  "soy sauce",
  "broth",
  "stock",
  "bean",
  "lentil",
  "quinoa",
  "oat",
  "cereal",
  "nut",
  "spice",
  "honey",
  "maple syrup",
  "extract",
  "vanilla",
  "baking",
  "yeast",
  "cornstarch",
  "cocoa",
  "chocolate",
  "sauce",
  "ketchup",
  "mustard",
  "mayo",
  "mayonnaise",
  "peanut butter",
  "jam",
  "jelly",
  "can",
  "canned",
];

const FROZEN_KEYWORDS = [
  "frozen",
  "ice cream",
  "puff pastry", // often sold frozen; bakery rule also matches — order matters
];

const BEVERAGE_KEYWORDS = [
  "water",
  "juice",
  "coffee",
  "tea",
  "soda",
  "wine",
  "beer",
  "brandy",
  "cognac",
  "whiskey",
  "whisky",
  "bourbon",
  "vodka",
  "rum",
  "gin",
  "tequila",
  "liqueur",
  "liquor",
  "champagne",
  "prosecco",
  "sherry",
  "vermouth",
  "port wine",
];

const SNACK_KEYWORDS = [
  "chip",
  "cracker",
  "cookie",
  "popcorn",
  "granola bar",
  "snack",
];

const HOUSEHOLD_KEYWORDS = [
  "container",
  "tupperware",
  "trash bag",
  "garbage bag",
  "ziploc",
  "ziplock",
  "aluminum foil",
  "foil",
  "plastic wrap",
  "cling wrap",
  "parchment",
  "paper towel",
  "dish soap",
  "soap",
  "sponge",
  "laundry",
];

/** More specific aisles first. Fresh peppers are handled separately from spice pepper. */
const SECTION_RULES: Array<{ section: GrocerySectionId; keywords: string[] }> = [
  { section: "frozen", keywords: FROZEN_KEYWORDS },
  { section: "meat_seafood", keywords: MEAT_SEAFOOD_KEYWORDS },
  { section: "dairy", keywords: DAIRY_KEYWORDS },
  { section: "bakery", keywords: BAKERY_KEYWORDS },
  {
    section: "produce",
    keywords: PRODUCE_KEYWORDS.filter((k) => k !== "pepper"),
  },
  { section: "pantry", keywords: PANTRY_KEYWORDS },
  { section: "beverages", keywords: BEVERAGE_KEYWORDS },
  { section: "snacks", keywords: SNACK_KEYWORDS },
  { section: "household", keywords: HOUSEHOLD_KEYWORDS },
];

const VALID_SECTIONS = new Set<string>(GROCERY_SECTIONS.map((s) => s.id));

/** Map common AI / import labels onto our aisle ids. */
const CATEGORY_ALIASES: Record<string, GrocerySectionId> = {
  produce: "produce",
  fruit: "produce",
  fruits: "produce",
  vegetable: "produce",
  vegetables: "produce",
  veg: "produce",
  meat: "meat_seafood",
  meats: "meat_seafood",
  seafood: "meat_seafood",
  meat_seafood: "meat_seafood",
  "meat & seafood": "meat_seafood",
  dairy: "dairy",
  "dairy & eggs": "dairy",
  eggs: "dairy",
  bakery: "bakery",
  bread: "bakery",
  breads: "bakery",
  pantry: "pantry",
  baking: "pantry",
  dry_goods: "pantry",
  "dry goods": "pantry",
  spices: "pantry",
  spice: "pantry",
  condiments: "pantry",
  canned: "pantry",
  frozen: "frozen",
  freezer: "frozen",
  beverages: "beverages",
  drinks: "beverages",
  drink: "beverages",
  snacks: "snacks",
  snack: "snacks",
  household: "household",
  other: "other",
  misc: "other",
  miscellaneous: "other",
};

/** Match keywords against singular/plural grocery names (blueberry ↔ blueberries). */
function nameMatchesKeyword(name: string, keyword: string): boolean {
  if (name.includes(keyword)) return true;
  if (keyword.endsWith("y") && keyword.length > 3) {
    const ies = `${keyword.slice(0, -1)}ies`;
    if (name.includes(ies)) return true;
  }
  if (name.includes(`${keyword}es`) || name.includes(`${keyword}s`)) return true;
  return false;
}

export function normalizeGrocerySection(
  stored: string | null | undefined,
): GrocerySectionId | null {
  if (!stored) return null;
  const key = stored.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const compact = key.replace(/\s+/g, "_");
  const aliased =
    CATEGORY_ALIASES[key] ??
    CATEGORY_ALIASES[compact] ??
    (VALID_SECTIONS.has(compact) ? (compact as GrocerySectionId) : null);
  return aliased;
}

export function inferGrocerySection(ingredientName: string): string {
  const normalized = ingredientName.trim().toLowerCase();
  if (!normalized) return "other";

  // Dried/spice forms belong in pantry even when the base word is produce
  // (garlic powder, onion flakes, chili powder…).
  if (
    /\b(powder|powdered|flakes|granules|seasoning|extract)\b/.test(normalized)
  ) {
    return "pantry";
  }

  if (/\b(black|white|ground|cayenne)\s+pepper\b/.test(normalized)) {
    return "pantry";
  }
  if (
    /\b(bell pepper|chili|chilli|jalape[nñ]o|serrano|poblano|habanero|peppers?)\b/.test(
      normalized,
    )
  ) {
    return "produce";
  }

  for (const rule of SECTION_RULES) {
    if (rule.keywords.some((keyword) => nameMatchesKeyword(normalized, keyword))) {
      return rule.section;
    }
  }

  return "other";
}

/**
 * Prefer an explicit stored aisle (manual picks, good imports).
 * Re-infer when missing/other/unknown so keyword rules can still improve junk data.
 */
export function resolveGrocerySection(
  stored: string | null | undefined,
  ingredientName: string,
): string {
  const normalized = normalizeGrocerySection(stored);
  if (normalized && normalized !== "other") return normalized;
  return inferGrocerySection(ingredientName);
}
