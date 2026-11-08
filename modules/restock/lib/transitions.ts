import type {
  Availability,
  CheckResult,
  StoreObservation,
  StoreState,
} from "@restock/types";

export type PrevStoreState = Pick<
  StoreState,
  "store_id" | "availability" | "available_since" | "name"
>;

export type StoreUpsert = StoreObservation & {
  availableSince: string | null;
  lastChangeAt: string | null;
  lastObservedAt: string;
};

export type TransitionEvent = {
  storeId: string;
  storeName: string;
  from: Availability | null;
  to: Availability;
  /** True when this transition should trigger a restock alert. */
  alert: boolean;
};

export type TransitionPlan = {
  upserts: StoreUpsert[];
  events: TransitionEvent[];
  /** Stores previously tracked that were absent from this successful response. */
  absent: Array<{ storeId: string; availability: Availability; detail: string }>;
};

/**
 * Decide what a *successful* check means relative to last-known state.
 *
 * - Failed / blocked / degraded / malformed checks never change state.
 * - A store becomes "available" → event (+alert) unless it was already available.
 *   This includes the very first observation.
 * - Available → unavailable/unknown → event (no alert). A later return to
 *   available alerts again.
 * - Unchanged availability → no event (duplicate alert suppression).
 * - Stores missing from a response that covers all stores in range → "unknown"
 *   ("not in latest results", e.g. radius shrank). Missing from an in-stock-only
 *   list → "unavailable" (no longer listed as having the item).
 */
export function planTransitions(
  previous: PrevStoreState[],
  result: CheckResult,
  nowIso: string,
): TransitionPlan {
  const plan: TransitionPlan = { upserts: [], events: [], absent: [] };
  if (result.status !== "ok") return plan;

  const prevById = new Map(previous.map((p) => [p.store_id, p]));
  const seen = new Set<string>();

  for (const obs of result.stores) {
    if (seen.has(obs.storeId)) continue;
    seen.add(obs.storeId);
    const prev = prevById.get(obs.storeId);
    const from: Availability | null = prev ? prev.availability : null;
    const to = obs.availability;
    const changed = from !== to;

    let availableSince: string | null = prev?.available_since ?? null;
    if (to === "available") {
      if (from !== "available" || !availableSince) availableSince = nowIso;
    } else {
      availableSince = null;
    }

    plan.upserts.push({
      ...obs,
      availableSince,
      lastChangeAt: changed ? nowIso : null,
      lastObservedAt: nowIso,
    });

    if (!prev) {
      if (to === "available") {
        plan.events.push({
          storeId: obs.storeId,
          storeName: obs.name,
          from: null,
          to,
          alert: true,
        });
      }
      continue;
    }

    if (changed) {
      plan.events.push({
        storeId: obs.storeId,
        storeName: obs.name,
        from,
        to,
        alert: to === "available",
      });
    }
  }

  for (const prev of previous) {
    if (seen.has(prev.store_id)) continue;
    const to: Availability = result.coversAllStoresInRange ? "unknown" : "unavailable";
    const detail = result.coversAllStoresInRange
      ? "Not in latest results (out of range?)"
      : "No longer listed as available";
    if (prev.availability === to) continue;
    plan.absent.push({ storeId: prev.store_id, availability: to, detail });
    plan.events.push({
      storeId: prev.store_id,
      storeName: prev.name,
      from: prev.availability,
      to,
      alert: false,
    });
  }

  return plan;
}

export function countAvailable(stores: StoreObservation[]): number {
  return stores.filter((s) => s.availability === "available").length;
}
