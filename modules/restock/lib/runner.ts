import { randomUUID } from "node:crypto";
import { browserSupported, withBrowserSession } from "@restock/lib/browser";
import {
  buildRestockEmail,
  deliverDueAlerts,
  getNotificationStatus,
} from "@restock/lib/notify";
import {
  backoffAfterFailure,
  isBackedOff,
  manualCheckAllowed,
  RUN_LOCK_TTL_MS,
  worstStatus,
} from "@restock/lib/scheduling";
import {
  acquireRunLock,
  applyTransitionPlan,
  ensureSettings,
  finishCheck,
  getSettings,
  insertAlert,
  insertCheck,
  listHouseholdIds,
  listProducts,
  listStoreStates,
  markAttempt,
  markRunOutcome,
  releaseRunLock,
} from "@restock/lib/store";
import { countAvailable, planTransitions } from "@restock/lib/transitions";
import { adapterFor } from "@restock/retailers/index";
import type { CheckContext } from "@restock/retailers/types";
import type { CheckStatus, RestockSettings, TrackedProduct } from "@restock/types";

export type ProductRunResult = {
  productId: string;
  retailer: TrackedProduct["retailer"];
  status: CheckStatus;
  method: string | null;
  storeCount: number;
  availableCount: number;
  error: string | null;
  alertsQueued: number;
};

export type RunSummary = {
  householdId: string;
  trigger: "cron" | "manual";
  ran: boolean;
  /** Why the run was skipped (not an error). */
  skippedReason?: string;
  /** Rate-limit hint for manual runs. */
  retryAfterSeconds?: number;
  results: ProductRunResult[];
  alertsSent: number;
  alertsFailed: number;
  success: boolean;
};

export function dashboardUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.AUTH_URL ??
    "https://kingstreetsites.com";
  return `${raw.replace(/\/$/, "")}/tools/restock-tracker`;
}

export function defaultAlertEmails(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.RESTOCK_ALERT_EMAILS;
  if (!raw) return [];
  return raw
    .split(/[,\s;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function loadSettings(householdId: string): Promise<RestockSettings> {
  return (
    (await getSettings(householdId)) ??
    (await ensureSettings(householdId, { alertEmails: defaultAlertEmails() }))
  );
}

async function persistProductCheck(
  settings: RestockSettings,
  product: TrackedProduct,
  trigger: "cron" | "manual",
  notificationsConfigured: boolean,
  recipients: string[],
  result: Awaited<ReturnType<ReturnType<typeof adapterFor>["check"]>>,
  startedAt: number,
): Promise<ProductRunResult> {
  const adapter = adapterFor(product.retailer);
  const checkId = await insertCheck({
    householdId: settings.household_id,
    productId: product.id,
    trigger,
  });

  let alertsQueued = 0;
  if (result.status === "ok") {
    const nowIso = new Date().toISOString();
    const previous = await listStoreStates(settings.household_id, product.id);
    const plan = planTransitions(previous, result, nowIso);
    const events = await applyTransitionPlan({
      householdId: settings.household_id,
      productId: product.id,
      checkId,
      plan,
    });

    if (notificationsConfigured) {
      const byStoreId = new Map(plan.upserts.map((u) => [u.storeId, u]));
      for (const event of events) {
        if (!event.alert) continue;
        const store = byStoreId.get(event.store_id);
        if (!store) continue;
        const email = buildRestockEmail({
          retailerLabel: adapter.label,
          productTitle: product.title,
          productUrl: adapter.productUrl(product),
          store: {
            name: store.name,
            address1: store.address1,
            address2: store.address2,
            city: store.city,
            state_code: store.stateCode,
            postal_code: store.postalCode,
            phone: store.phone,
            directions_url: store.directionsUrl,
            distance_miles: store.distanceMiles,
            detail: store.detail,
          },
          observedAtIso: event.observed_at,
          dashboardUrl: dashboardUrl(),
        });
        await insertAlert({
          householdId: settings.household_id,
          productId: product.id,
          eventId: event.id,
          storeId: event.store_id,
          kind: "restock",
          recipients,
          subject: email.subject,
          body: email.text,
        });
        alertsQueued += 1;
      }
    }
  }

  await finishCheck(checkId, {
    status: result.status,
    method: result.method,
    error: result.error,
    storeCount: result.status === "ok" ? result.stores.length : null,
    availableCount: result.status === "ok" ? countAvailable(result.stores) : null,
    durationMs: Date.now() - startedAt,
  });

  return {
    productId: product.id,
    retailer: product.retailer,
    status: result.status,
    method: result.method,
    storeCount: result.stores.length,
    availableCount: countAvailable(result.stores),
    error: result.error,
    alertsQueued,
  };
}

/**
 * Run one check cycle for a household: every enabled product, once, under a
 * DB lock so cron ticks and manual clicks never overlap. Failed checks never
 * touch store state; only alerts for *new* availability are queued.
 */
export async function runHouseholdCheck(
  householdId: string,
  opts: { trigger: "cron" | "manual" },
): Promise<RunSummary> {
  const settings = await loadSettings(householdId);
  const now = new Date();
  const base: RunSummary = {
    householdId,
    trigger: opts.trigger,
    ran: false,
    results: [],
    alertsSent: 0,
    alertsFailed: 0,
    success: false,
  };

  if (opts.trigger === "cron") {
    if (!settings.monitoring_enabled) {
      const notifications = getNotificationStatus(settings.alert_emails);
      let alertsSent = 0;
      let alertsFailed = 0;
      if (notifications.configured) {
        const delivered = await deliverDueAlerts(householdId);
        alertsSent = delivered.sent;
        alertsFailed = delivered.failed;
      }
      return {
        ...base,
        skippedReason: "Monitoring is disabled",
        alertsSent,
        alertsFailed,
      };
    }
    if (isBackedOff(settings.backoff_until, now)) {
      return {
        ...base,
        skippedReason: `Backing off until ${settings.backoff_until} after repeated failures`,
      };
    }
  } else {
    const allowed = manualCheckAllowed(settings.last_manual_check_at, now);
    if (!allowed.ok) {
      return {
        ...base,
        skippedReason: `Please wait ${allowed.retryAfterSeconds}s between manual checks`,
        retryAfterSeconds: allowed.retryAfterSeconds,
      };
    }
  }

  const token = randomUUID();
  const locked = await acquireRunLock(householdId, token, RUN_LOCK_TTL_MS);
  if (!locked) {
    return { ...base, skippedReason: "A check is already running" };
  }

  try {
    await markAttempt(householdId, opts.trigger);
    const notifications = getNotificationStatus(settings.alert_emails);
    const products = (await listProducts(householdId)).filter((p) => p.enabled);

    const baseCtx: CheckContext = {
      postalCode: settings.postal_code,
      radiusMiles: settings.radius_miles,
      skipBrowserLaunch: true,
    };
    const results: ProductRunResult[] = [];
    const retry: Array<{ product: TrackedProduct; startedAt: number }> = [];

    async function fetchResult(product: TrackedProduct, ctx: CheckContext) {
      return adapterFor(product.retailer).check(product, ctx);
    }

    async function persist(
      product: TrackedProduct,
      result: Awaited<ReturnType<typeof fetchResult>>,
      startedAt: number,
    ) {
      try {
        return await persistProductCheck(
          settings,
          product,
          opts.trigger,
          notifications.configured,
          notifications.recipients,
          result,
          startedAt,
        );
      } catch (err) {
        return {
          productId: product.id,
          retailer: product.retailer,
          status: "error" as const,
          method: result.method,
          storeCount: 0,
          availableCount: 0,
          error: err instanceof Error ? err.message : "Unexpected error",
          alertsQueued: 0,
        };
      }
    }

    for (const product of products) {
      const startedAt = Date.now();
      try {
        const result = await fetchResult(product, baseCtx);
        if (
          result.status === "blocked" &&
          browserSupported() &&
          /deferred/i.test(result.error ?? "")
        ) {
          retry.push({ product, startedAt });
        } else {
          results.push(await persist(product, result, startedAt));
        }
      } catch (err) {
        results.push({
          productId: product.id,
          retailer: product.retailer,
          status: "error",
          method: null,
          storeCount: 0,
          availableCount: 0,
          error: err instanceof Error ? err.message : "Unexpected error",
          alertsQueued: 0,
        });
      }
    }

    if (retry.length > 0) {
      const retried = new Set<string>();
      try {
        await withBrowserSession(async (session) => {
          for (const item of retry) {
            try {
              const result = await fetchResult(item.product, {
                ...baseCtx,
                skipBrowserLaunch: false,
                browser: session,
              });
              results.push(await persist(item.product, result, item.startedAt));
            } catch (err) {
              results.push({
                productId: item.product.id,
                retailer: item.product.retailer,
                status: "error",
                method: "browser",
                storeCount: 0,
                availableCount: 0,
                error: err instanceof Error ? err.message : "Unexpected error",
                alertsQueued: 0,
              });
            }
            retried.add(item.product.id);
          }
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Browser session failed";
        for (const item of retry) {
          if (retried.has(item.product.id)) continue;
          results.push({
            productId: item.product.id,
            retailer: item.product.retailer,
            status: "error",
            method: "browser",
            storeCount: 0,
            availableCount: 0,
            error: message,
            alertsQueued: 0,
          });
        }
      }
    }

    // Success = every configured provider parsed cleanly. A blocked/erroring
    // provider backs the whole schedule off so we never hammer a WAF.
    const meaningful = results.filter((r) => r.status !== "skipped");
    const success = meaningful.length > 0 && meaningful.every((r) => r.status === "ok");
    const worst = worstStatus(meaningful.map((r) => r.status));
    await markRunOutcome(householdId, {
      success,
      backoffMs: success
        ? null
        : backoffAfterFailure(settings.consecutive_failures + 1, worst),
    });

    let alertsSent = 0;
    let alertsFailed = 0;
    if (notifications.configured) {
      const delivered = await deliverDueAlerts(householdId);
      alertsSent = delivered.sent;
      alertsFailed = delivered.failed;
    }

    return { ...base, ran: true, results, alertsSent, alertsFailed, success };
  } finally {
    await releaseRunLock(householdId, token);
  }
}

/** Cron entry: ensure settings exist for every household, then check each. */
export async function runAllHouseholdChecks(): Promise<{
  households: number;
  ran: number;
  skipped: number;
  summaries: RunSummary[];
}> {
  const ids = await listHouseholdIds();
  const summaries: RunSummary[] = [];
  for (const householdId of ids) {
    await ensureSettings(householdId, { alertEmails: defaultAlertEmails() });
    summaries.push(await runHouseholdCheck(householdId, { trigger: "cron" }));
  }
  return {
    households: ids.length,
    ran: summaries.filter((s) => s.ran).length,
    skipped: summaries.filter((s) => !s.ran).length,
    summaries,
  };
}
