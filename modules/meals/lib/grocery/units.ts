const UNIT_ALIASES: Record<string, string> = {
  c: "cup",
  cup: "cup",
  cups: "cup",
  tbsp: "tbsp",
  tbs: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  clove: "clove",
  cloves: "clove",
  piece: "item",
  pieces: "item",
  pinch: "pinch",
  pinches: "pinch",
  can: "can",
  cans: "can",
  bunch: "bunch",
  bunches: "bunch",
  slice: "slice",
  slices: "slice",
  head: "head",
  heads: "head",
  stalk: "stalk",
  stalks: "stalk",
  sprig: "sprig",
  sprigs: "sprig",
  package: "package",
  packages: "package",
  pkg: "package",
  bag: "bag",
  bags: "bag",
  bottle: "bottle",
  bottles: "bottle",
  jar: "jar",
  jars: "jar",
  box: "box",
  boxes: "box",
  stick: "stick",
  sticks: "stick",
  fillet: "fillet",
  fillets: "fillet",
  whole: "whole",
  item: "item",
  items: "item",
  each: "item",
  large: "item",
  medium: "item",
  small: "item",
  serving: "serving",
  servings: "serving",
};

type UnitFamily =
  | "volume"
  | "weight"
  | "count"
  | "unknown";

const UNIT_FAMILIES: Record<string, UnitFamily> = {
  cup: "volume",
  tbsp: "volume",
  tsp: "volume",
  ml: "volume",
  l: "volume",
  oz: "weight",
  lb: "weight",
  g: "weight",
  kg: "weight",
  clove: "count",
  piece: "count",
  pinch: "count",
  can: "count",
  bunch: "count",
  slice: "count",
  head: "count",
  stalk: "count",
  sprig: "count",
  package: "count",
  bag: "count",
  bottle: "count",
  jar: "count",
  box: "count",
  stick: "count",
  fillet: "count",
  whole: "count",
  item: "count",
  serving: "count",
};

/** Base unit conversions within a family (multiplier to convert from unit -> base). */
const TO_BASE: Record<string, number> = {
  cup: 48,
  tbsp: 3,
  tsp: 1,
  ml: 1 / 4.92892,
  l: 202.884,
  oz: 1,
  lb: 16,
  g: 1 / 28.3495,
  kg: 35.274,
};

/** Units that mean “some / unmeasured” — merge with the same ingredient’s measured line. */
const LOOSE_UNITS = new Set([
  "pinch",
  "taste",
  "to taste",
  "as needed",
  "as desired",
  "dash",
  "sprinkle",
  "handful",
  "for seasoning",
  "seasoning",
  "optional",
]);

function cleanUnit(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    // Recipe imports often store "tablespoons (85 grams)"
    .replace(/\([^)]*\)/g, " ")
    .replace(/\./g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUnit(unit: string): string {
  const cleaned = cleanUnit(unit);
  if (!cleaned) {
    return "";
  }
  if (LOOSE_UNITS.has(cleaned)) {
    return cleaned === "pinch" ? "pinch" : "taste";
  }
  // "to taste", "as needed", etc. already handled; also "for taste"
  if (/^(to|as)\s+/.test(cleaned) || cleaned.includes("taste")) {
    return "taste";
  }
  return UNIT_ALIASES[cleaned] ?? cleaned;
}

export function isLooseUnit(unit: string): boolean {
  const normalized = normalizeUnit(unit);
  return !normalized || normalized === "pinch" || normalized === "taste";
}

function getUnitFamily(unit: string): UnitFamily {
  const normalized = normalizeUnit(unit);
  return UNIT_FAMILIES[normalized] ?? "unknown";
}

export function areUnitsCompatible(a: string, b: string): boolean {
  const normA = normalizeUnit(a);
  const normB = normalizeUnit(b);

  // Loose / missing units always merge onto the same shopping item.
  if (isLooseUnit(normA) || isLooseUnit(normB)) {
    return true;
  }

  if (normA === normB) {
    return true;
  }

  const familyA = getUnitFamily(normA);
  const familyB = getUnitFamily(normB);

  if (familyA === "unknown" || familyB === "unknown") {
    return false;
  }

  if (familyA === "count" && familyB === "count") {
    return normA === normB;
  }

  return familyA === familyB;
}

export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (!from || !to) {
    return null;
  }

  if (from === to) {
    return quantity;
  }

  if (!areUnitsCompatible(from, to)) {
    return null;
  }

  const family = getUnitFamily(from);

  if (family === "count") {
    return null;
  }

  const fromBase = TO_BASE[from];
  const toBase = TO_BASE[to];

  if (fromBase === undefined || toBase === undefined) {
    return null;
  }

  const baseQuantity = quantity * fromBase;
  return baseQuantity / toBase;
}

export { UNIT_ALIASES, UNIT_FAMILIES };
