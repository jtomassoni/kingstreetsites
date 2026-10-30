import type { MealType } from "@meals/types/database";
import { toDateOnlyString } from "@meals/lib/dates";
import { normalizeMealTitle, shuffleCopy } from "@meals/lib/meals/defaults";

export type PlanDayLike = {
  id: string;
  day_date: string;
  profile_type: string;
  needs_portable_snacks: boolean;
};

export type PlannedMealLike = {
  plan_day_id: string;
  meal_type: string;
};

export type OpenMealSlot = {
  key: string;
  planDayId: string;
  dayDate: string;
  mealType: MealType;
};

const CORE_MEALS: MealType[] = ["breakfast", "lunch", "dinner"];

export function mealNeedsMinCalendarPortions(mealType: string): boolean {
  return CORE_MEALS.includes(mealType as MealType);
}

type DayLike = { id: string; day_date: string };

export function calendarSlotKey(planDayId: string, mealType: string) {
  return `${planDayId}:${mealType}`;
}

export function parseCalendarSlotKey(value: string): {
  planDayId: string;
  mealType: MealType;
} | null {
  const sep = value.lastIndexOf(":");
  if (sep <= 0) return null;
  const planDayId = value.slice(0, sep);
  const mealType = value.slice(sep + 1) as MealType;
  if (!planDayId || !mealType) return null;
  return { planDayId, mealType };
}

/** Next day, same meal type. */
export function suggestNextSameMealSlot(
  days: DayLike[],
  cookPlanDayId: string,
  cookMealType: MealType,
): { planDayId: string; mealType: MealType } | null {
  const sorted = [...days].sort((a, b) =>
    String(a.day_date).localeCompare(String(b.day_date)),
  );
  const index = sorted.findIndex((day) => day.id === cookPlanDayId);
  const next = index >= 0 ? sorted[index + 1] : null;
  if (!next || next.id === cookPlanDayId) return null;
  return { planDayId: next.id, mealType: cookMealType };
}

/** Empty meal slots for the week: B/L/D plus snacks on workdays. */
export function computeOpenMealSlots(
  days: PlanDayLike[],
  meals: PlannedMealLike[],
): OpenMealSlot[] {
  const occupied = new Set(
    meals.map((m) => `${m.plan_day_id}:${m.meal_type}`),
  );
  const slots: OpenMealSlot[] = [];

  for (const day of [...days].sort((a, b) =>
    String(a.day_date).localeCompare(String(b.day_date)),
  )) {
    const wanted: MealType[] = [...CORE_MEALS];
    if (day.needs_portable_snacks || day.profile_type === "workday") {
      wanted.push("snack_prep");
    }
    for (const mealType of wanted) {
      if (occupied.has(`${day.id}:${mealType}`)) continue;
      const dayDate = toDateOnlyString(day.day_date);
      slots.push({
        key: `${dayDate}:${mealType}`,
        planDayId: day.id,
        dayDate,
        mealType,
      });
    }
  }

  return slots;
}

export type NameProposal = {
  key: string;
  planDayId: string;
  dayDate: string;
  mealType: MealType;
  title: string;
};

export type LibraryRecipeLike = {
  title: string;
  meal_types: string[] | null;
};

export type ExistingMealTitle = {
  title: string;
  meal_type: string;
  dayDate?: string;
};

/** A dish fill-week adds to the week must appear at least this many times (small-batch prep). */
export const MIN_FILL_WEEK_TITLE_USES = 2;

const MEAL_TYPE_ORDER: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack_prep",
  "other",
];

export function countMealTitles(
  meals: { title: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const meal of meals) {
    const key = normalizeMealTitle(meal.title);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Partition n slots into batches of 2–3 so we never leave a one-off. */
export function batchSizesForSlots(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [1];
  const sizes: number[] = [];
  let remaining = count;
  while (remaining > 0) {
    if (remaining === 1 || remaining === 3) {
      sizes.push(remaining);
      break;
    }
    if (remaining % 2 === 1) {
      sizes.push(3);
      remaining -= 3;
    } else {
      sizes.push(2);
      remaining -= 2;
    }
  }
  return sizes;
}

function titleKey(title: string): string {
  return normalizeMealTitle(title);
}

function isAvoided(title: string, avoid: Set<string>): boolean {
  return avoid.has(titleKey(title));
}

function dayStamp(dayDate: string): string {
  return dayDate.slice(0, 10);
}

export function datesAreConsecutive(a: string, b: string): boolean {
  const ms =
    Date.parse(`${dayStamp(a)}T00:00:00Z`) -
    Date.parse(`${dayStamp(b)}T00:00:00Z`);
  if (!Number.isFinite(ms)) return false;
  return Math.abs(Math.round(ms / 86_400_000)) === 1;
}

export function titleOnConsecutiveDay(
  title: string,
  dayDate: string,
  meals: { title: string; dayDate?: string }[],
): boolean {
  const key = titleKey(title);
  return meals.some(
    (meal) =>
      Boolean(meal.dayDate) &&
      titleKey(meal.title) === key &&
      datesAreConsecutive(meal.dayDate!, dayDate),
  );
}

function pickLibraryTitle(
  mealType: MealType,
  library: LibraryRecipeLike[],
  alreadyBatched: Set<string>,
  avoid: Set<string>,
): string | null {
  const eligible = library.filter((recipe) => !isAvoided(recipe.title, avoid));
  const unusedTyped = eligible.filter(
    (recipe) =>
      !alreadyBatched.has(titleKey(recipe.title)) &&
      (recipe.meal_types ?? []).includes(mealType),
  );
  const unusedAny = eligible.filter(
    (recipe) => !alreadyBatched.has(titleKey(recipe.title)),
  );
  const typed = eligible.filter((recipe) =>
    (recipe.meal_types ?? []).includes(mealType),
  );
  return (
    unusedTyped[0]?.title ??
    unusedAny[0]?.title ??
    typed[0]?.title ??
    eligible[0]?.title ??
    null
  );
}

function addDish(
  dishes: { title: string; count: number }[],
  title: string,
  count: number,
) {
  const key = titleKey(title);
  const found = dishes.find((dish) => titleKey(dish.title) === key);
  if (found) found.count += count;
  else dishes.push({ title, count });
}

function pickExtendTitle(
  mealType: MealType,
  dayDate: string,
  existing: ExistingMealTitle[],
  proposed: NameProposal[],
  occupied: { title: string; dayDate: string }[],
  avoid: Set<string>,
): string | null {
  const combined = [...existing, ...proposed].filter(
    (item) =>
      ("meal_type" in item ? item.meal_type : item.mealType) === mealType &&
      !isAvoided(item.title, avoid) &&
      !titleOnConsecutiveDay(item.title, dayDate, occupied),
  );
  if (!combined.length) return null;
  const counts = countMealTitles(combined);
  let best: string | null = null;
  let bestCount = -1;
  for (const item of combined) {
    const n = counts.get(titleKey(item.title)) ?? 0;
    if (n > bestCount) {
      best = item.title;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Place dishes onto slots so repeats are interleaved — never the same title
 * on consecutive calendar days. Leaves a slot empty rather than stacking.
 */
export function spreadDishesAcrossSlots(
  slots: OpenMealSlot[],
  dishes: { title: string; count: number }[],
  occupied: { title: string; dayDate: string }[],
): NameProposal[] {
  const remaining = dishes
    .filter((dish) => dish.count > 0 && titleKey(dish.title))
    .map((dish) => ({ ...dish }));
  if (!remaining.length) return [];

  const placed = occupied.map((meal) => ({ ...meal }));
  const proposals: NameProposal[] = [];
  const cycle = remaining.map((dish) => dish.title);
  let cursor = 0;

  for (const slot of [...slots].sort((a, b) =>
    a.dayDate.localeCompare(b.dayDate),
  )) {
    let chosen: (typeof remaining)[number] | null = null;
    for (let attempt = 0; attempt < cycle.length; attempt++) {
      const title = cycle[(cursor + attempt) % cycle.length]!;
      const dish = remaining.find((item) => item.title === title);
      if (!dish || dish.count <= 0) continue;
      if (titleOnConsecutiveDay(dish.title, slot.dayDate, placed)) continue;
      chosen = dish;
      cursor = (cursor + attempt + 1) % cycle.length;
      break;
    }
    if (!chosen) {
      chosen =
        remaining
          .filter(
            (dish) =>
              dish.count > 0 &&
              !titleOnConsecutiveDay(dish.title, slot.dayDate, placed),
          )
          .sort((a, b) => b.count - a.count)[0] ?? null;
    }
    if (!chosen) continue;
    chosen.count -= 1;
    proposals.push({ ...slot, title: chosen.title });
    placed.push({ title: chosen.title, dayDate: slot.dayDate });
  }

  return proposals;
}

function occupiedFromExisting(
  existing: ExistingMealTitle[],
  proposed: NameProposal[],
): { title: string; dayDate: string }[] {
  return [
    ...existing
      .filter((meal) => Boolean(meal.dayDate))
      .map((meal) => ({ title: meal.title, dayDate: meal.dayDate! })),
    ...proposed.map((item) => ({ title: item.title, dayDate: item.dayDate })),
  ];
}

/**
 * Propose titles for open slots as small prep batches: each new dish appears
 * at least twice, interleaved so the same dish is never two calendar days in a row.
 * A leftover single slot reuses something already on the week instead of a new dish.
 */
export function proposeRepeatableNames(
  slots: OpenMealSlot[],
  library: LibraryRecipeLike[],
  existing: ExistingMealTitle[],
  options?: {
    avoidTitles?: string[];
    random?: () => number;
  },
): NameProposal[] {
  const avoid = new Set(
    (options?.avoidTitles ?? []).map(titleKey).filter(Boolean),
  );
  const pool = shuffleCopy(library, options?.random ?? Math.random);
  const alreadyBatched = new Set(
    existing.map((meal) => titleKey(meal.title)).filter(Boolean),
  );
  const remaining = [...slots];
  const proposals: NameProposal[] = [];
  const counts = countMealTitles(existing);

  const singles = [...counts.entries()].filter(([, n]) => n === 1);
  for (const [norm] of singles) {
    if (avoid.has(norm)) continue;
    const src = existing.find((meal) => titleKey(meal.title) === norm);
    if (!src) continue;
    const occupied = occupiedFromExisting(existing, proposals);
    const sameType = remaining
      .filter((slot) => slot.mealType === src.meal_type)
      .sort((a, b) => a.dayDate.localeCompare(b.dayDate));
    const next = sameType.find(
      (slot) => !titleOnConsecutiveDay(src.title, slot.dayDate, occupied),
    );
    if (!next) continue;
    const idx = remaining.findIndex((slot) => slot.key === next.key);
    if (idx < 0) continue;
    remaining.splice(idx, 1);
    proposals.push({ ...next, title: src.title });
    counts.set(norm, 2);
  }

  const types = MEAL_TYPE_ORDER.filter((type) =>
    remaining.some((slot) => slot.mealType === type),
  );

  for (const mealType of types) {
    const typeSlots = remaining
      .filter((slot) => slot.mealType === mealType)
      .sort((a, b) => a.dayDate.localeCompare(b.dayDate));
    const sizes = batchSizesForSlots(typeSlots.length);
    const dishes: { title: string; count: number }[] = [];
    const leftoverSlots: OpenMealSlot[] = [];
    let offset = 0;
    for (const size of sizes) {
      const batch = typeSlots.slice(offset, offset + size);
      offset += size;
      if (!batch.length) continue;
      if (size === 1) {
        leftoverSlots.push(...batch);
        continue;
      }
      const title = pickLibraryTitle(mealType, pool, alreadyBatched, avoid);
      if (!title) continue;
      alreadyBatched.add(titleKey(title));
      addDish(dishes, title, size);
    }

    const occupied = occupiedFromExisting(existing, proposals);
    const spread = spreadDishesAcrossSlots(typeSlots.filter((slot) => !leftoverSlots.some((left) => left.key === slot.key)), dishes, occupied);
    proposals.push(...spread);

    for (const slot of leftoverSlots) {
      const occupiedNow = occupiedFromExisting(existing, proposals);
      const title = pickExtendTitle(
        mealType,
        slot.dayDate,
        existing,
        proposals,
        occupiedNow,
        avoid,
      );
      if (!title) continue;
      proposals.push({ ...slot, title });
    }
  }

  const byKey = new Map(proposals.map((p) => [p.key, p]));
  const ordered = slots
    .map((slot) => byKey.get(slot.key))
    .filter((p): p is NameProposal => Boolean(p));
  return filterAcceptedMeetingMinUses(ordered, existing).kept;
}

/** One library idea per open slot — for fill-day (no batch/min-use rules). */
export function proposeDayFillNames(
  slots: OpenMealSlot[],
  library: LibraryRecipeLike[],
  existing: ExistingMealTitle[],
  options?: { avoidTitles?: string[] },
): NameProposal[] {
  const avoid = new Set(
    (options?.avoidTitles ?? []).map(titleKey).filter(Boolean),
  );
  const pool = shuffleCopy(library);
  const alreadyUsed = new Set<string>();
  const proposals: NameProposal[] = [];

  const ordered = [...slots].sort((a, b) => {
    const typeOrder =
      MEAL_TYPE_ORDER.indexOf(a.mealType) -
      MEAL_TYPE_ORDER.indexOf(b.mealType);
    if (typeOrder !== 0) return typeOrder;
    return a.dayDate.localeCompare(b.dayDate);
  });

  for (const slot of ordered) {
    const occupied = occupiedFromExisting(existing, proposals);
    let title = pickLibraryTitle(slot.mealType, pool, alreadyUsed, avoid);
    if (
      title &&
      titleOnConsecutiveDay(title, slot.dayDate, occupied)
    ) {
      const alternate = pool.find(
        (recipe) =>
          !isAvoided(recipe.title, avoid) &&
          !alreadyUsed.has(titleKey(recipe.title)) &&
          !titleOnConsecutiveDay(recipe.title, slot.dayDate, occupied),
      );
      title = alternate?.title ?? title;
    }
    if (!title) continue;
    alreadyUsed.add(titleKey(title));
    proposals.push({ ...slot, title });
  }

  return proposals;
}

/**
 * Collapse one-off AI titles so every dish meets the min-use rule, then
 * interleave repeats so the same dish is never two calendar days in a row.
 */
export function enforceMinTitleUses(
  proposals: NameProposal[],
  existing: ExistingMealTitle[],
  options?: { avoidTitles?: string[] },
): NameProposal[] {
  const avoid = new Set(
    (options?.avoidTitles ?? []).map(titleKey).filter(Boolean),
  );
  const rebuilt: NameProposal[] = [];

  const types = MEAL_TYPE_ORDER.filter((type) =>
    proposals.some((p) => p.mealType === type),
  );

  for (const mealType of types) {
    const group = proposals
      .filter((p) => p.mealType === mealType)
      .sort((a, b) => a.dayDate.localeCompare(b.dayDate));
    const slots = group.map((p) => ({
      key: p.key,
      planDayId: p.planDayId,
      dayDate: p.dayDate,
      mealType: p.mealType,
    }));
    const preferred: string[] = [];
    const seen = new Set<string>();
    for (const item of group) {
      const key = titleKey(item.title);
      if (!key || avoid.has(key) || seen.has(key)) continue;
      seen.add(key);
      preferred.push(item.title);
    }

    const sizes = batchSizesForSlots(slots.length);
    const dishes: { title: string; count: number }[] = [];
    const leftoverSlots: OpenMealSlot[] = [];
    let dishIndex = 0;
    let offset = 0;
    for (const size of sizes) {
      const batch = slots.slice(offset, offset + size);
      offset += size;
      if (size === 1) {
        leftoverSlots.push(...batch);
        continue;
      }
      const title = preferred[dishIndex] ?? preferred[0];
      dishIndex += 1;
      if (!title) continue;
      addDish(dishes, title, size);
    }

    const occupied = occupiedFromExisting(existing, rebuilt);
    rebuilt.push(
      ...spreadDishesAcrossSlots(
        slots.filter(
          (slot) => !leftoverSlots.some((left) => left.key === slot.key),
        ),
        dishes,
        occupied,
      ),
    );

    for (const slot of leftoverSlots) {
      const original = group.find((item) => item.key === slot.key);
      const occupiedNow = occupiedFromExisting(existing, rebuilt);
      const title = original?.title ?? pickExtendTitle(
        mealType,
        slot.dayDate,
        existing,
        rebuilt,
        occupiedNow,
        avoid,
      );
      if (!title) continue;
      if (titleOnConsecutiveDay(title, slot.dayDate, occupiedNow)) continue;
      rebuilt.push({ ...slot, title });
    }
  }

  return filterAcceptedMeetingMinUses(rebuilt, existing).kept;
}

export function filterAcceptedMeetingMinUses(
  accepted: NameProposal[],
  existing: ExistingMealTitle[],
): { kept: NameProposal[]; skipped: NameProposal[] } {
  const counts = countMealTitles([...existing, ...accepted]);
  const kept: NameProposal[] = [];
  const skipped: NameProposal[] = [];
  for (const item of accepted) {
    if ((counts.get(titleKey(item.title)) ?? 0) >= MIN_FILL_WEEK_TITLE_USES) {
      kept.push(item);
    } else {
      skipped.push(item);
    }
  }
  return { kept, skipped };
}
