import { describe, expect, it } from "vitest";
import { deliveryDecision, planDeliveryRetry } from "../../modules/restock/lib/scheduling";
import { isAuthorizedCronRequest } from "../../modules/restock/lib/scheduling";
import { planTransitions } from "../../modules/restock/lib/transitions";
import type { CheckResult, StoreObservation } from "../../modules/restock/types";

const now = "2026-11-08T18:00:00.000Z";

function store(partial: Partial<StoreObservation> & Pick<StoreObservation, "storeId" | "name" | "availability">): StoreObservation {
  return {
    address1: "123 Main",
    address2: null,
    city: "Denver",
    stateCode: "CO",
    postalCode: "80219",
    phone: null,
    directionsUrl: null,
    distanceMiles: 2,
    detail: null,
    ...partial,
  };
}

function ok(stores: StoreObservation[], coversAllStoresInRange = true): CheckResult {
  return {
    status: "ok",
    method: "direct",
    stores,
    error: null,
    coversAllStoresInRange,
  };
}

describe("availability transitions", () => {
  it("alerts on the first successful observation of availability", () => {
    const plan = planTransitions(
      [],
      ok([store({ storeId: "2730", name: "Hancock Plaza", availability: "available" })]),
      now,
    );
    expect(plan.events).toEqual([
      expect.objectContaining({
        storeId: "2730",
        from: null,
        to: "available",
        alert: true,
      }),
    ]);
  });

  it("suppresses duplicate alerts while the same store stays available", () => {
    const plan = planTransitions(
      [
        {
          store_id: "2730",
          availability: "available",
          available_since: "2026-11-08T12:00:00.000Z",
          name: "Hancock Plaza",
        },
      ],
      ok([store({ storeId: "2730", name: "Hancock Plaza", availability: "available" })]),
      now,
    );
    expect(plan.events).toEqual([]);
    expect(plan.upserts[0]?.lastChangeAt).toBeNull();
  });

  it("alerts again after a confirmed unavailable → available transition", () => {
    const plan = planTransitions(
      [
        {
          store_id: "2730",
          availability: "unavailable",
          available_since: null,
          name: "Hancock Plaza",
        },
      ],
      ok([store({ storeId: "2730", name: "Hancock Plaza", availability: "available" })]),
      now,
    );
    expect(plan.events[0]).toMatchObject({
      from: "unavailable",
      to: "available",
      alert: true,
    });
  });

  it("does not plan any state change for a failed or blocked check", () => {
    const previous = [
      {
        store_id: "2730",
        availability: "unavailable",
        available_since: null,
        name: "Hancock Plaza",
      },
    ];
    for (const status of ["blocked", "malformed", "error", "degraded"] as const) {
      const plan = planTransitions(
        previous,
        {
          status,
          method: "direct",
          stores: [store({ storeId: "2730", name: "Hancock Plaza", availability: "available" })],
          error: "nope",
          coversAllStoresInRange: true,
        },
        now,
      );
      expect(plan.upserts).toEqual([]);
      expect(plan.events).toEqual([]);
    }
  });

  it("does not alert when a store drops to unavailable", () => {
    const plan = planTransitions(
      [
        {
          store_id: "2730",
          availability: "available",
          available_since: now,
          name: "Hancock Plaza",
        },
      ],
      ok([store({ storeId: "2730", name: "Hancock Plaza", availability: "unavailable" })]),
      now,
    );
    expect(plan.events[0]?.alert).toBe(false);
    expect(plan.events[0]?.to).toBe("unavailable");
  });
});

describe("notification retry / suppression", () => {
  it("never re-sends an already-sent alert", () => {
    expect(
      deliveryDecision({ status: "sent", recipients: ["a@b.c"] }),
    ).toBe("already_sent");
  });

  it("keeps failed deliveries pending until the attempt cap, then marks failed", () => {
    expect(planDeliveryRetry(1)).toEqual({ status: "pending", delayMs: 60_000 });
    expect(planDeliveryRetry(2).status).toBe("pending");
    expect(planDeliveryRetry(6)).toEqual({
      status: "failed",
      delayMs: 60 * 60_000,
    });
  });
});

describe("cron authorization", () => {
  it("fails closed when CRON_SECRET is missing or short", () => {
    expect(isAuthorizedCronRequest("Bearer abc", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer abc", "short")).toBe(false);
  });

  it("accepts only an exact Bearer token match", () => {
    const secret = "sixteen-chars-ok-plus";
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCronRequest(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCronRequest(secret, secret)).toBe(false);
  });
});
