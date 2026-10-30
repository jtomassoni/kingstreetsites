import { resolveGrocerySection } from "@meals/lib/grocery/sections";
import { canonicalizeShoppingName } from "@meals/lib/grocery/shopping-name";
import {
  areUnitsCompatible,
  convertQuantity,
  isLooseUnit,
  normalizeUnit,
} from "@meals/lib/grocery/units";

export interface GroceryMealSource {
  plannedMealId: string;
  recipeId?: string;
  recipeIngredientId?: string;
  mealTitle: string;
}

export interface GroceryCandidate {
  name: string;
  quantity: number | null;
  unit: string;
  section: string;
  preferredStore: string;
  costcoBulkCandidate: boolean;
  sourceNote: string;
  plannedMealId?: string;
  recipeIngredientId?: string;
  sources?: GroceryMealSource[];
}

/** Prior bad stems from over-eager singularization (repair existing lists). */
const DISPLAY_REPAIRS: Record<string, string> = {
  hummu: "hummus",
  asparagu: "asparagus",
  couscou: "couscous",
};

const SMALL_WORDS = new Set(["and", "or", "of", "with", "a", "an", "the"]);

/** Pretty label for shopping lists: "olive oil" → "Olive Oil". */
export function formatGroceryItemName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  const repaired = DISPLAY_REPAIRS[trimmed.toLowerCase()] ?? trimmed;
  return repaired
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      if (lower.length <= 2 && index > 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Shopping-list name key (prep forms collapsed). */
export function normalizeIngredientName(name: string): string {
  const repaired = DISPLAY_REPAIRS[name.trim().toLowerCase()] ?? name;
  return canonicalizeShoppingName(repaired);
}

function mergeSources(
  base: GroceryMealSource[] | undefined,
  incoming: GroceryMealSource[] | undefined,
): GroceryMealSource[] {
  const merged: GroceryMealSource[] = [];
  const seen = new Set<string>();
  for (const source of [...(base ?? []), ...(incoming ?? [])]) {
    const key = `${source.plannedMealId}:${source.recipeIngredientId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }
  return merged;
}

function mergeSourceNotes(existing: string, incoming: string): string {
  if (!existing) {
    return incoming;
  }
  if (!incoming || existing.includes(incoming)) {
    return existing;
  }
  return `${existing}; ${incoming}`;
}

function unitRank(unit: string): number {
  const n = normalizeUnit(unit);
  if (isLooseUnit(n)) return 0;
  const family = n;
  // Prefer common kitchen volume, then weight, then counts.
  if (family === "cup" || family === "tbsp" || family === "tsp") return 40;
  if (family === "ml" || family === "l") return 35;
  if (family === "lb" || family === "oz" || family === "g" || family === "kg")
    return 30;
  if (family === "clove") return 20;
  return 10;
}

function mergeItem(
  base: GroceryCandidate,
  incoming: GroceryCandidate,
): GroceryCandidate {
  const baseUnit = normalizeUnit(base.unit);
  const incomingUnit = normalizeUnit(incoming.unit);
  const baseLoose = isLooseUnit(baseUnit);
  const incomingLoose = isLooseUnit(incomingUnit);

  const section =
    base.section && base.section !== "other"
      ? base.section
      : incoming.section && incoming.section !== "other"
        ? incoming.section
        : base.section || incoming.section || "other";

  const shared = {
    section,
    preferredStore:
      base.preferredStore === "any"
        ? incoming.preferredStore
        : base.preferredStore,
    costcoBulkCandidate:
      base.costcoBulkCandidate || incoming.costcoBulkCandidate,
    sourceNote: mergeSourceNotes(base.sourceNote, incoming.sourceNote),
    sources: mergeSources(base.sources, incoming.sources),
  };

  // Prefer any measured line over pinch / to taste / blank.
  if (incomingLoose && !baseLoose) {
    return { ...base, ...shared };
  }
  if (baseLoose && !incomingLoose) {
    return {
      ...incoming,
      ...shared,
      name: base.name,
      unit: incomingUnit || incoming.unit,
    };
  }
  if (baseLoose && incomingLoose) {
    return {
      ...base,
      ...shared,
      quantity: null,
      unit: "",
    };
  }

  let mergedQuantity: number | null = null;
  let unit = baseUnit || base.unit;

  if (base.quantity !== null && incoming.quantity !== null) {
    const converted = convertQuantity(
      incoming.quantity,
      incomingUnit,
      baseUnit,
    );
    if (converted !== null) {
      mergedQuantity = base.quantity + converted;
    } else if (areUnitsCompatible(baseUnit, incomingUnit)) {
      // Same family but no converter — keep base unit, add raw (last resort).
      mergedQuantity = base.quantity + incoming.quantity;
    } else {
      // Incompatible measured units (e.g. volume vs weight): keep the
      // higher-ranked unit’s quantity so the list stays one shopping line.
      if (unitRank(incomingUnit) > unitRank(baseUnit)) {
        return {
          ...incoming,
          ...shared,
          name: base.name,
          quantity: incoming.quantity,
          unit: incomingUnit,
        };
      }
      mergedQuantity = base.quantity;
    }
  } else if (base.quantity !== null) {
    mergedQuantity = base.quantity;
  } else {
    mergedQuantity = incoming.quantity;
    unit = incomingUnit || unit;
  }

  return {
    ...base,
    ...shared,
    quantity: mergedQuantity,
    unit,
  };
}

export function consolidateGroceryItems(
  items: GroceryCandidate[],
): GroceryCandidate[] {
  const groups = new Map<string, GroceryCandidate[]>();

  for (const item of items) {
    const shoppingName = canonicalizeShoppingName(item.name);
    const existing = groups.get(shoppingName);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(shoppingName, [item]);
    }
  }

  const consolidated: GroceryCandidate[] = [];

  for (const [shoppingName, group] of groups) {
    // Prefer measured rows first so merge keeps real quantities.
    const sorted = [...group].sort((a, b) => {
      const rankDiff = unitRank(b.unit) - unitRank(a.unit);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name);
    });

    let merged = {
      ...sorted[0]!,
      name: formatGroceryItemName(shoppingName),
      unit: normalizeUnit(sorted[0]!.unit),
    };

    for (let i = 1; i < sorted.length; i++) {
      merged = mergeItem(merged, sorted[i]!);
    }

    const name = formatGroceryItemName(shoppingName);
    consolidated.push({
      ...merged,
      name,
      unit: isLooseUnit(merged.unit) ? "" : normalizeUnit(merged.unit),
      section: resolveGrocerySection(merged.section, name),
    });
  }

  return consolidated.sort((a, b) => a.name.localeCompare(b.name));
}
