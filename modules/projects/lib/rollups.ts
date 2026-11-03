import type { CostRollup, HouseLineItem } from "@projects/types";

export function rollupFromLineItems(
  items: Pick<HouseLineItem, "estimate_cents" | "actual_cents">[],
  budgetCents: number | null = null,
): CostRollup {
  let estimate = 0;
  let actual = 0;
  for (const item of items) {
    if (typeof item.estimate_cents === "number") estimate += item.estimate_cents;
    if (typeof item.actual_cents === "number") actual += item.actual_cents;
  }
  return {
    estimate_cents: estimate,
    actual_cents: actual,
    budget_cents: budgetCents,
    remaining_cents:
      budgetCents === null ? null : budgetCents - actual,
  };
}
