import { canonicalizeShoppingName } from "@meals/lib/grocery/shopping-name";
import { convertQuantity, isLooseUnit, normalizeUnit } from "@meals/lib/grocery/units";
import { formatQuantity } from "@meals/lib/recipes/display";

export type PackagingStore = "grocery" | "costco";

export interface PackagingInput {
  name: string;
  quantity: number | null;
  unit: string;
  store: PackagingStore;
}

export interface PackagingResult {
  quantity: number | null;
  unit: string;
  /** Recipe-need, in a shopper-friendly unit (eggs, cloves, tbsp…). */
  neededQuantity: number | null;
  neededUnit: string;
  /** Set when the store pack is larger than this week's recipes. */
  surplusNote: string | null;
  packed: boolean;
}

interface StorePack {
  /** Amount in one package, in the rule's canonical unit. */
  canonicalSize: number;
  /** What to show on the list for one package. */
  buyQuantity: number;
  buyUnit: string;
}

interface PackagingRule {
  names: string[];
  /** Also match "extra virgin olive oil" when names include "olive oil". */
  matchSuffix?: boolean;
  /** Canonical unit used for pack math (count, tbsp, cup, oz, clove, ml, lb). */
  canonicalUnit: string;
  grocery: StorePack;
  costco: StorePack;
  /** Friendly unit for "only need X this week". */
  needUnit: string;
}

const COUNT_LIKE = new Set([
  "",
  "piece",
  "item",
  "whole",
  "large",
  "medium",
  "small",
  "egg",
  "eggs",
  "count",
  "each",
]);

const PACKAGING_RULES: PackagingRule[] = [
  {
    names: ["eggs", "egg"],
    canonicalUnit: "count",
    needUnit: "eggs",
    grocery: { canonicalSize: 6, buyQuantity: 6, buyUnit: "eggs" },
    costco: { canonicalSize: 24, buyQuantity: 24, buyUnit: "eggs" },
  },
  {
    names: ["butter"],
    canonicalUnit: "tbsp",
    needUnit: "tbsp",
    grocery: { canonicalSize: 32, buyQuantity: 1, buyUnit: "lb" }, // 1 lb = 4 sticks
    costco: { canonicalSize: 128, buyQuantity: 4, buyUnit: "lb" },
  },
  {
    names: ["milk"],
    canonicalUnit: "cup",
    needUnit: "cups",
    grocery: { canonicalSize: 8, buyQuantity: 1, buyUnit: "half-gallon" },
    costco: { canonicalSize: 32, buyQuantity: 2, buyUnit: "gal" },
  },
  {
    names: ["heavy cream", "heavy whipping cream", "whipping cream"],
    canonicalUnit: "cup",
    needUnit: "cups",
    grocery: { canonicalSize: 2, buyQuantity: 1, buyUnit: "pint" },
    costco: { canonicalSize: 8, buyQuantity: 2, buyUnit: "quart" },
  },
  {
    names: ["sour cream"],
    canonicalUnit: "cup",
    needUnit: "cups",
    grocery: { canonicalSize: 2, buyQuantity: 16, buyUnit: "oz" },
    costco: { canonicalSize: 6, buyQuantity: 3, buyUnit: "lb" },
  },
  {
    names: ["cream cheese"],
    canonicalUnit: "oz",
    needUnit: "oz",
    grocery: { canonicalSize: 8, buyQuantity: 8, buyUnit: "oz" },
    costco: { canonicalSize: 48, buyQuantity: 3, buyUnit: "lb" },
  },
  {
    names: ["bacon"],
    canonicalUnit: "slice",
    needUnit: "slices",
    grocery: { canonicalSize: 12, buyQuantity: 1, buyUnit: "pack" },
    costco: { canonicalSize: 48, buyQuantity: 3, buyUnit: "lb pack" },
  },
  {
    names: ["garlic"],
    canonicalUnit: "clove",
    needUnit: "cloves",
    grocery: { canonicalSize: 10, buyQuantity: 1, buyUnit: "head" },
    costco: { canonicalSize: 30, buyQuantity: 3, buyUnit: "head" },
  },
  {
    names: ["olive oil"],
    matchSuffix: true,
    canonicalUnit: "ml",
    needUnit: "tbsp",
    grocery: { canonicalSize: 500, buyQuantity: 1, buyUnit: "bottle" },
    costco: { canonicalSize: 2000, buyQuantity: 2, buyUnit: "L bottle" },
  },
  {
    names: ["vegetable oil", "canola oil"],
    matchSuffix: true,
    canonicalUnit: "ml",
    needUnit: "tbsp",
    grocery: { canonicalSize: 1420, buyQuantity: 1, buyUnit: "bottle" },
    costco: { canonicalSize: 3000, buyQuantity: 3, buyUnit: "L bottle" },
  },
  {
    names: ["flour", "all purpose flour", "all-purpose flour"],
    canonicalUnit: "cup",
    needUnit: "cups",
    grocery: { canonicalSize: 18, buyQuantity: 5, buyUnit: "lb" }, // ~18 cups in 5 lb
    costco: { canonicalSize: 90, buyQuantity: 25, buyUnit: "lb" },
  },
  {
    names: ["sugar", "white sugar", "granulated sugar"],
    canonicalUnit: "cup",
    needUnit: "cups",
    grocery: { canonicalSize: 9, buyQuantity: 4, buyUnit: "lb" },
    costco: { canonicalSize: 22, buyQuantity: 10, buyUnit: "lb" },
  },
  {
    names: ["rice", "white rice", "brown rice"],
    canonicalUnit: "cup",
    needUnit: "cups",
    grocery: { canonicalSize: 4, buyQuantity: 2, buyUnit: "lb" },
    costco: { canonicalSize: 50, buyQuantity: 25, buyUnit: "lb" },
  },
  {
    names: [
      "pasta",
      "spaghetti",
      "penne",
      "fettuccine",
      "linguine",
      "macaroni",
      "rotini",
    ],
    matchSuffix: true,
    canonicalUnit: "oz",
    needUnit: "oz",
    grocery: { canonicalSize: 16, buyQuantity: 1, buyUnit: "box" },
    costco: { canonicalSize: 96, buyQuantity: 6, buyUnit: "box" },
  },
  {
    names: ["chicken broth", "vegetable broth", "beef broth"],
    matchSuffix: true,
    canonicalUnit: "cup",
    needUnit: "cups",
    grocery: { canonicalSize: 4, buyQuantity: 1, buyUnit: "carton" },
    costco: { canonicalSize: 24, buyQuantity: 6, buyUnit: "carton" },
  },
  {
    names: ["soy sauce"],
    canonicalUnit: "tbsp",
    needUnit: "tbsp",
    grocery: { canonicalSize: 20, buyQuantity: 1, buyUnit: "bottle" },
    costco: { canonicalSize: 128, buyQuantity: 64, buyUnit: "oz" },
  },
  {
    names: ["bread", "sandwich bread"],
    canonicalUnit: "slice",
    needUnit: "slices",
    grocery: { canonicalSize: 20, buyQuantity: 1, buyUnit: "loaf" },
    costco: { canonicalSize: 40, buyQuantity: 2, buyUnit: "loaf" },
  },
  {
    names: ["tortilla", "flour tortilla", "corn tortilla"],
    canonicalUnit: "count",
    needUnit: "tortillas",
    grocery: { canonicalSize: 10, buyQuantity: 10, buyUnit: "tortillas" },
    costco: { canonicalSize: 24, buyQuantity: 24, buyUnit: "tortillas" },
  },
  {
    names: ["oats", "rolled oats", "old fashioned oats"],
    canonicalUnit: "cup",
    needUnit: "cups",
    grocery: { canonicalSize: 8, buyQuantity: 18, buyUnit: "oz" },
    costco: { canonicalSize: 40, buyQuantity: 10, buyUnit: "lb" },
  },
  {
    names: ["mayonnaise", "mayo"],
    canonicalUnit: "tbsp",
    needUnit: "tbsp",
    grocery: { canonicalSize: 30, buyQuantity: 1, buyUnit: "jar" },
    costco: { canonicalSize: 128, buyQuantity: 64, buyUnit: "oz" },
  },
  {
    names: ["ketchup"],
    canonicalUnit: "tbsp",
    needUnit: "tbsp",
    grocery: { canonicalSize: 34, buyQuantity: 1, buyUnit: "bottle" },
    costco: { canonicalSize: 114, buyQuantity: 2, buyUnit: "bottle" },
  },
  {
    names: ["mustard", "dijon mustard", "yellow mustard"],
    canonicalUnit: "tsp",
    needUnit: "tsp",
    grocery: { canonicalSize: 48, buyQuantity: 1, buyUnit: "jar" },
    costco: { canonicalSize: 144, buyQuantity: 2, buyUnit: "jar" },
  },
  {
    names: [
      "diced tomato",
      "crushed tomato",
      "canned tomato",
      "tomato sauce",
    ],
    matchSuffix: true,
    canonicalUnit: "can",
    needUnit: "cans",
    grocery: { canonicalSize: 1, buyQuantity: 1, buyUnit: "can" },
    costco: { canonicalSize: 8, buyQuantity: 8, buyUnit: "can" },
  },
  {
    names: ["salt"],
    canonicalUnit: "tsp",
    needUnit: "tsp",
    grocery: { canonicalSize: 200, buyQuantity: 1, buyUnit: "container" },
    costco: { canonicalSize: 400, buyQuantity: 2, buyUnit: "container" },
  },
  {
    names: ["black pepper", "pepper"],
    canonicalUnit: "tsp",
    needUnit: "tsp",
    grocery: { canonicalSize: 40, buyQuantity: 1, buyUnit: "container" },
    costco: { canonicalSize: 120, buyQuantity: 6, buyUnit: "oz" },
  },
  {
    names: ["yogurt", "plain yogurt", "greek yogurt"],
    canonicalUnit: "cup",
    needUnit: "cups",
    grocery: { canonicalSize: 4, buyQuantity: 32, buyUnit: "oz" },
    costco: { canonicalSize: 12, buyQuantity: 3, buyUnit: "lb" },
  },
  {
    names: ["cheese slice", "american cheese", "sliced cheese"],
    canonicalUnit: "slice",
    needUnit: "slices",
    grocery: { canonicalSize: 12, buyQuantity: 12, buyUnit: "slices" },
    costco: { canonicalSize: 48, buyQuantity: 48, buyUnit: "slices" },
  },
  {
    names: ["cheddar", "mozzarella", "shredded cheddar", "shredded mozzarella"],
    matchSuffix: true,
    canonicalUnit: "oz",
    needUnit: "oz",
    grocery: { canonicalSize: 8, buyQuantity: 8, buyUnit: "oz" },
    costco: { canonicalSize: 32, buyQuantity: 2, buyUnit: "lb" },
  },
  {
    names: ["chicken breast", "chicken thigh", "chicken"],
    canonicalUnit: "lb",
    needUnit: "lb",
    grocery: { canonicalSize: 1, buyQuantity: 1, buyUnit: "lb" },
    costco: { canonicalSize: 6, buyQuantity: 6, buyUnit: "lb" },
  },
  {
    names: ["ground beef", "ground turkey"],
    canonicalUnit: "lb",
    needUnit: "lb",
    grocery: { canonicalSize: 1, buyQuantity: 1, buyUnit: "lb" },
    costco: { canonicalSize: 5, buyQuantity: 5, buyUnit: "lb" },
  },
];

const NOTE_SURPLUS =
  /^Buy\s+([\d.]+)\s*(.*?);\s*only need\s+([\d.]+)(?:\s+(.+?))?\s+this week/i;
const NOTE_NEED = /^Need\s+([\d.]+)(?:\s+(.+?))?\s+this week/i;

export function isPackagingSurplusNote(notes: string | null | undefined): boolean {
  if (!notes) return false;
  return NOTE_SURPLUS.test(notes.trim());
}

/** Keep shopper notes unless they were a generated pack callout. */
export function notesAfterPackaging(
  surplusNote: string | null,
  existing: string | null | undefined,
): string | null {
  if (surplusNote) return surplusNote;
  if (parseNeededFromPackagingNote(existing)) return null;
  return existing?.trim() ? existing : null;
}

/** Recover the week's recipe need so Costco toggles can re-pack. */
export function parseNeededFromPackagingNote(
  notes: string | null | undefined,
): { quantity: number; unit: string } | null {
  if (!notes) return null;
  const text = notes.trim();
  const surplus = text.match(NOTE_SURPLUS);
  if (surplus) {
    const quantity = Number(surplus[3]);
    if (!Number.isFinite(quantity)) return null;
    return { quantity, unit: (surplus[4] ?? "").trim() };
  }
  const need = text.match(NOTE_NEED);
  if (need) {
    const quantity = Number(need[1]);
    if (!Number.isFinite(quantity)) return null;
    return { quantity, unit: (need[2] ?? "").trim() };
  }
  return null;
}

export function packGroceryItemForStore(
  item: {
    name: string;
    quantity: number | null;
    unit: string | null;
    notes: string | null;
  },
  store: PackagingStore,
): {
  quantity: number | null;
  unit: string;
  notes: string | null;
} {
  const needed = parseNeededFromPackagingNote(item.notes) ?? {
    quantity: item.quantity,
    unit: item.unit ?? "",
  };
  const packed = applyStorePackaging({
    name: item.name,
    quantity: needed.quantity,
    unit: needed.unit,
    store,
  });
  return {
    quantity: packed.quantity,
    unit: packed.unit,
    notes: notesAfterPackaging(packed.surplusNote, item.notes),
  };
}

export function applyStorePackaging(input: PackagingInput): PackagingResult {
  const rawQty =
    input.quantity == null || input.quantity === undefined
      ? null
      : Number(input.quantity);
  const unit = input.unit ?? "";

  if (rawQty == null || !Number.isFinite(rawQty) || rawQty <= 0) {
    return {
      quantity: input.quantity,
      unit,
      neededQuantity: rawQty,
      neededUnit: unit,
      surplusNote: null,
      packed: false,
    };
  }

  const tasteOrPinch = isLooseUnit(unit) && Boolean(normalizeUnit(unit));
  if (tasteOrPinch) {
    return {
      quantity: input.quantity,
      unit,
      neededQuantity: rawQty,
      neededUnit: unit,
      surplusNote: null,
      packed: false,
    };
  }

  const rule = findRule(canonicalizeShoppingName(input.name));
  if (!rule) {
    return ceilCountFallback(rawQty, unit);
  }

  const canonicalNeeded = toCanonical(rawQty, unit, rule);
  if (canonicalNeeded == null) {
    return ceilCountFallback(rawQty, unit);
  }

  const pack = input.store === "costco" ? rule.costco : rule.grocery;
  const packs = Math.max(1, Math.ceil((canonicalNeeded - 1e-9) / pack.canonicalSize));
  const buyQuantity = roundNice(packs * pack.buyQuantity);
  const buyUnit = pack.buyUnit;
  const neededDisplay = roundNice(
    toNeedDisplay(canonicalNeeded, rule, rawQty, unit),
  );
  const neededUnit = rule.needUnit;

  const surplus = packs * pack.canonicalSize - canonicalNeeded > 0.05;
  const surplusNote = surplus
    ? formatSurplusNote(buyQuantity, buyUnit, neededDisplay, neededUnit)
    : null;

  return {
    quantity: buyQuantity,
    unit: buyUnit,
    neededQuantity: neededDisplay,
    neededUnit,
    surplusNote,
    packed: true,
  };
}

function formatSurplusNote(
  buyQty: number,
  buyUnit: string,
  needQty: number,
  needUnit: string,
): string {
  const buy = formatQuantity(buyQty, buyUnit);
  const sameUnit =
    buyUnit === needUnit ||
    (buyUnit === "eggs" && (needUnit === "eggs" || needUnit === "egg"));
  const need = sameUnit
    ? formatQuantity(needQty, null)
    : formatQuantity(needQty, needUnit);
  return `Buy ${buy}; only need ${need} this week — check the fridge`;
}

function findRule(canonical: string): PackagingRule | undefined {
  for (const rule of PACKAGING_RULES) {
    if (rule.names.includes(canonical)) return rule;
    if (!rule.matchSuffix) continue;
    if (rule.names.some((name) => canonical.endsWith(` ${name}`))) {
      return rule;
    }
  }
  return undefined;
}

function toCanonical(
  quantity: number,
  unit: string,
  rule: PackagingRule,
): number | null {
  const n = normalizeUnit(unit);
  const target = rule.canonicalUnit;

  if (target === "count") {
    return toCount(quantity, n || unit);
  }
  if (target === "clove") {
    return toCloves(quantity, n || unit);
  }
  if (target === "slice") {
    return toSlices(quantity, n || unit);
  }
  if (target === "can") {
    if (!n || n === "can" || COUNT_LIKE.has(n) || COUNT_LIKE.has(unit.toLowerCase())) {
      return quantity;
    }
    return null;
  }

  const special = specialVolumeOrWeight(quantity, n || unit, target);
  if (special != null) return special;

  const converted = convertQuantity(quantity, n || unit, target);
  if (converted != null) return converted;

  if (!n || n === target || unit.toLowerCase() === target) {
    return quantity;
  }
  return null;
}

function toCount(quantity: number, unit: string): number | null {
  const u = unit.toLowerCase().trim();
  if (u === "dozen") return quantity * 12;
  if (COUNT_LIKE.has(u) || COUNT_LIKE.has(normalizeUnit(unit))) return quantity;
  return null;
}

function toCloves(quantity: number, unit: string): number | null {
  const n = normalizeUnit(unit);
  if (n === "clove" || COUNT_LIKE.has(n) || COUNT_LIKE.has(unit.toLowerCase())) {
    return quantity;
  }
  if (n === "head" || unit.toLowerCase().includes("head")) {
    return quantity * 10;
  }
  return null;
}

function toSlices(quantity: number, unit: string): number | null {
  const n = normalizeUnit(unit);
  if (n === "slice" || COUNT_LIKE.has(n) || COUNT_LIKE.has(unit.toLowerCase())) {
    return quantity;
  }
  if (n === "lb") return quantity * 16;
  if (n === "oz") return quantity;
  return null;
}

/** Extra kitchen units convertQuantity does not know (stick, gallon, pint…). */
function specialVolumeOrWeight(
  quantity: number,
  unit: string,
  target: string,
): number | null {
  const u = unit.toLowerCase().trim();
  const asCups: Record<string, number> = {
    stick: 0.5, // butter stick
    sticks: 0.5,
    gallon: 16,
    gal: 16,
    "half-gallon": 8,
    "half gallon": 8,
    quart: 4,
    qt: 4,
    pint: 2,
    pt: 2,
    "fl oz": 0.125,
    floz: 0.125,
  };
  const cupFactor = asCups[u];
  if (cupFactor != null) {
    const cups = quantity * cupFactor;
    if (target === "cup") return cups;
    const fromCups = convertQuantity(cups, "cup", target);
    return fromCups;
  }

  if ((u === "stick" || u === "sticks") && target === "tbsp") {
    return quantity * 8;
  }
  if ((u === "lb" || u === "pound" || u === "pounds") && target === "tbsp") {
    // Butter: 1 lb = 32 tbsp
    return quantity * 32;
  }
  if (target === "ml" && (u === "tbsp" || normalizeUnit(unit) === "tbsp")) {
    return quantity * 15;
  }
  if (target === "ml" && (u === "tsp" || normalizeUnit(unit) === "tsp")) {
    return quantity * 5;
  }
  if (target === "ml" && (u === "cup" || normalizeUnit(unit) === "cup")) {
    return quantity * 240;
  }
  if (target === "ml" && (u === "l" || normalizeUnit(unit) === "l")) {
    return quantity * 1000;
  }
  if (target === "tbsp" && (u === "ml" || normalizeUnit(unit) === "ml")) {
    return quantity / 15;
  }
  return null;
}

function toNeedDisplay(
  canonicalNeeded: number,
  rule: PackagingRule,
  rawQty: number,
  rawUnit: string,
): number {
  if (rule.canonicalUnit === "ml" && rule.needUnit === "tbsp") {
    return canonicalNeeded / 15;
  }
  if (rule.needUnit === "eggs" || rule.needUnit === "cloves") {
    return canonicalNeeded;
  }
  // Prefer the recipe's original number when the unit already matches.
  const n = normalizeUnit(rawUnit);
  if (!n || n === rule.canonicalUnit || rawUnit.toLowerCase() === rule.needUnit) {
    return rawQty;
  }
  return canonicalNeeded;
}

function ceilCountFallback(quantity: number, unit: string): PackagingResult {
  const n = normalizeUnit(unit);
  const countLike =
    COUNT_LIKE.has(n) ||
    COUNT_LIKE.has(unit.toLowerCase()) ||
    ["clove", "slice", "head", "bunch", "can", "stalk", "fillet", "whole"].includes(
      n,
    );
  if (countLike && quantity > 0 && quantity !== Math.ceil(quantity - 1e-9)) {
    const ceiled = Math.ceil(quantity - 1e-9);
    return {
      quantity: ceiled,
      unit,
      neededQuantity: quantity,
      neededUnit: unit,
      surplusNote: null,
      packed: false,
    };
  }
  return {
    quantity,
    unit,
    neededQuantity: quantity,
    neededUnit: unit,
    surplusNote: null,
    packed: false,
  };
}

function roundNice(n: number): number {
  const rounded = Math.round(n * 100) / 100;
  return Math.abs(rounded - Math.round(rounded)) < 1e-6
    ? Math.round(rounded)
    : rounded;
}
