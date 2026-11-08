import { query, queryOne } from "@meals/lib/db";
import { MAX_ALERT_ATTEMPTS, planDeliveryRetry } from "@restock/lib/scheduling";
import type { TransitionPlan } from "@restock/lib/transitions";
import { DEFAULT_TRACKED_PRODUCTS } from "@restock/retailers/index";
import {
  RADIUS_OPTIONS,
  type AlertRecord,
  type CheckMethod,
  type CheckRecord,
  type CheckStatus,
  type RadiusMiles,
  type RestockSettings,
  type StockEvent,
  type StoreState,
  type TrackedProduct,
} from "@restock/types";

type Row = Record<string, unknown>;

function s(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}
function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}
function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function mapSettings(row: Row): RestockSettings {
  const radius = Number(row.radius_miles);
  return {
    household_id: String(row.household_id),
    postal_code: String(row.postal_code),
    radius_miles: (RADIUS_OPTIONS as readonly number[]).includes(radius)
      ? (radius as RadiusMiles)
      : 30,
    monitoring_enabled: row.monitoring_enabled !== false,
    alert_emails: arr(row.alert_emails),
    last_attempted_at: s(row.last_attempted_at),
    last_success_at: s(row.last_success_at),
    consecutive_failures: Number(row.consecutive_failures ?? 0),
    backoff_until: s(row.backoff_until),
    last_manual_check_at: s(row.last_manual_check_at),
    run_lock_token: s(row.run_lock_token),
    run_lock_expires_at: s(row.run_lock_expires_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapProduct(row: Row): TrackedProduct {
  return {
    id: String(row.id),
    household_id: String(row.household_id),
    retailer: row.retailer as TrackedProduct["retailer"],
    retailer_product_id: String(row.retailer_product_id),
    title: String(row.title),
    product_url: String(row.product_url),
    enabled: row.enabled !== false,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapStoreState(row: Row): StoreState {
  return {
    id: String(row.id),
    household_id: String(row.household_id),
    product_id: String(row.product_id),
    store_id: String(row.store_id),
    name: String(row.name),
    address1: s(row.address1),
    address2: s(row.address2),
    city: s(row.city),
    state_code: s(row.state_code),
    postal_code: s(row.postal_code),
    phone: s(row.phone),
    directions_url: s(row.directions_url),
    distance_miles: n(row.distance_miles),
    availability: row.availability as StoreState["availability"],
    detail: s(row.detail),
    first_seen_at: String(row.first_seen_at),
    last_observed_at: s(row.last_observed_at),
    available_since: s(row.available_since),
    last_change_at: s(row.last_change_at),
    updated_at: String(row.updated_at),
  };
}

function mapCheck(row: Row): CheckRecord {
  return {
    id: String(row.id),
    household_id: String(row.household_id),
    product_id: String(row.product_id),
    trigger: row.trigger as CheckRecord["trigger"],
    started_at: String(row.started_at),
    finished_at: s(row.finished_at),
    status: row.status as CheckStatus,
    method: (s(row.method) as CheckMethod | null) ?? null,
    error: s(row.error),
    store_count: n(row.store_count),
    available_count: n(row.available_count),
    duration_ms: n(row.duration_ms),
  };
}

function mapEvent(row: Row): StockEvent {
  return {
    id: String(row.id),
    household_id: String(row.household_id),
    product_id: String(row.product_id),
    check_id: s(row.check_id),
    store_id: String(row.store_id),
    store_name: String(row.store_name),
    from_availability: (s(row.from_availability) as StockEvent["from_availability"]) ?? null,
    to_availability: row.to_availability as StockEvent["to_availability"],
    observed_at: String(row.observed_at),
  };
}

function mapAlert(row: Row): AlertRecord {
  return {
    id: String(row.id),
    household_id: String(row.household_id),
    product_id: s(row.product_id),
    event_id: s(row.event_id),
    store_id: s(row.store_id),
    kind: row.kind as AlertRecord["kind"],
    recipients: arr(row.recipients),
    subject: String(row.subject),
    body: String(row.body),
    status: row.status as AlertRecord["status"],
    attempts: Number(row.attempts ?? 0),
    last_error: s(row.last_error),
    next_attempt_at: String(row.next_attempt_at),
    sent_at: s(row.sent_at),
    provider_message_id: s(row.provider_message_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function ensureSettings(
  householdId: string,
  defaults: { alertEmails: string[] },
): Promise<RestockSettings> {
  const row = await queryOne<Row>`
    INSERT INTO restock_settings (household_id, alert_emails)
    VALUES (${householdId}, ${defaults.alertEmails}::text[])
    ON CONFLICT (household_id) DO UPDATE SET household_id = EXCLUDED.household_id
    RETURNING *
  `;
  if (!row) throw new Error("Could not initialize restock settings");

  const existing = await query<{ id: string }>`
    SELECT id FROM restock_products WHERE household_id = ${householdId} LIMIT 1
  `;
  if (existing.length === 0) {
    for (const p of DEFAULT_TRACKED_PRODUCTS) {
      await query`
        INSERT INTO restock_products (household_id, retailer, retailer_product_id, title, product_url)
        VALUES (${householdId}, ${p.retailer}, ${p.retailerProductId}, ${p.title}, ${p.productUrl})
        ON CONFLICT (household_id, retailer, retailer_product_id) DO NOTHING
      `;
    }
  }
  return mapSettings(row);
}

export async function getSettings(householdId: string): Promise<RestockSettings | null> {
  const row = await queryOne<Row>`
    SELECT * FROM restock_settings WHERE household_id = ${householdId}
  `;
  return row ? mapSettings(row) : null;
}

export async function listMonitoredHouseholds(): Promise<RestockSettings[]> {
  const rows = await query<Row>`
    SELECT * FROM restock_settings WHERE monitoring_enabled = true
  `;
  return rows.map(mapSettings);
}

export async function listHouseholdIds(): Promise<string[]> {
  const rows = await query<{ id: string }>`
    SELECT id FROM households ORDER BY created_at ASC
  `;
  return rows.map((r) => String(r.id));
}

export async function updateSettings(
  householdId: string,
  patch: Partial<Pick<RestockSettings, "postal_code" | "radius_miles" | "monitoring_enabled" | "alert_emails">>,
): Promise<RestockSettings | null> {
  const current = await getSettings(householdId);
  if (!current) return null;
  const row = await queryOne<Row>`
    UPDATE restock_settings SET
      postal_code = ${patch.postal_code ?? current.postal_code},
      radius_miles = ${patch.radius_miles ?? current.radius_miles},
      monitoring_enabled = ${patch.monitoring_enabled ?? current.monitoring_enabled},
      alert_emails = ${patch.alert_emails ?? current.alert_emails}::text[]
    WHERE household_id = ${householdId}
    RETURNING *
  `;
  return row ? mapSettings(row) : null;
}

// ── Run lock / scheduler health ─────────────────────────────────────────────

export async function acquireRunLock(
  householdId: string,
  token: string,
  ttlMs: number,
): Promise<boolean> {
  const row = await queryOne<{ household_id: string }>`
    UPDATE restock_settings
    SET run_lock_token = ${token},
        run_lock_expires_at = now() + make_interval(secs => ${Math.ceil(ttlMs / 1000)})
    WHERE household_id = ${householdId}
      AND (run_lock_token IS NULL OR run_lock_expires_at IS NULL OR run_lock_expires_at < now())
    RETURNING household_id
  `;
  return Boolean(row);
}

export async function releaseRunLock(householdId: string, token: string): Promise<void> {
  await query`
    UPDATE restock_settings
    SET run_lock_token = NULL, run_lock_expires_at = NULL
    WHERE household_id = ${householdId} AND run_lock_token = ${token}
  `;
}

export async function markAttempt(householdId: string, trigger: "cron" | "manual"): Promise<void> {
  if (trigger === "manual") {
    await query`
      UPDATE restock_settings
      SET last_attempted_at = now(), last_manual_check_at = now()
      WHERE household_id = ${householdId}
    `;
    return;
  }
  await query`
    UPDATE restock_settings SET last_attempted_at = now()
    WHERE household_id = ${householdId}
  `;
}

export async function markRunOutcome(
  householdId: string,
  outcome: { success: boolean; backoffMs: number | null },
): Promise<void> {
  if (outcome.success) {
    await query`
      UPDATE restock_settings
      SET last_success_at = now(), consecutive_failures = 0, backoff_until = NULL
      WHERE household_id = ${householdId}
    `;
    return;
  }
  const secs = outcome.backoffMs ? Math.ceil(outcome.backoffMs / 1000) : null;
  await query`
    UPDATE restock_settings
    SET consecutive_failures = consecutive_failures + 1,
        backoff_until = CASE
          WHEN ${secs}::int IS NULL THEN NULL
          ELSE now() + make_interval(secs => ${secs}::int)
        END
    WHERE household_id = ${householdId}
  `;
}

// ── Products ────────────────────────────────────────────────────────────────

export async function listProducts(householdId: string): Promise<TrackedProduct[]> {
  const rows = await query<Row>`
    SELECT * FROM restock_products
    WHERE household_id = ${householdId}
    ORDER BY retailer ASC, created_at ASC
  `;
  return rows.map(mapProduct);
}

export async function setProductEnabled(
  householdId: string,
  productId: string,
  enabled: boolean,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>`
    UPDATE restock_products SET enabled = ${enabled}
    WHERE id = ${productId} AND household_id = ${householdId}
    RETURNING id
  `;
  return Boolean(row);
}

// ── Checks ──────────────────────────────────────────────────────────────────

export async function insertCheck(input: {
  householdId: string;
  productId: string;
  trigger: "cron" | "manual";
}): Promise<string> {
  const row = await queryOne<{ id: string }>`
    INSERT INTO restock_checks (household_id, product_id, trigger, status)
    VALUES (${input.householdId}, ${input.productId}, ${input.trigger}, 'error')
    RETURNING id
  `;
  if (!row) throw new Error("Could not record check");
  return row.id;
}

export async function finishCheck(
  checkId: string,
  input: {
    status: CheckStatus;
    method: CheckMethod | null;
    error: string | null;
    storeCount: number | null;
    availableCount: number | null;
    durationMs: number;
  },
): Promise<void> {
  await query`
    UPDATE restock_checks SET
      finished_at = now(),
      status = ${input.status},
      method = ${input.method},
      error = ${input.error ? input.error.slice(0, 1000) : null},
      store_count = ${input.storeCount},
      available_count = ${input.availableCount},
      duration_ms = ${input.durationMs}
    WHERE id = ${checkId}
  `;
}

export async function listRecentChecks(householdId: string, limit = 30): Promise<CheckRecord[]> {
  const rows = await query<Row>`
    SELECT * FROM restock_checks
    WHERE household_id = ${householdId}
    ORDER BY started_at DESC
    LIMIT ${limit}
  `;
  return rows.map(mapCheck);
}

export async function latestChecksByProduct(householdId: string): Promise<{
  last: Record<string, CheckRecord | undefined>;
  lastOk: Record<string, CheckRecord | undefined>;
}> {
  const lastRows = await query<Row>`
    SELECT DISTINCT ON (product_id) *
    FROM restock_checks
    WHERE household_id = ${householdId} AND finished_at IS NOT NULL
    ORDER BY product_id, started_at DESC
  `;
  const okRows = await query<Row>`
    SELECT DISTINCT ON (product_id) *
    FROM restock_checks
    WHERE household_id = ${householdId} AND status = 'ok'
    ORDER BY product_id, started_at DESC
  `;
  const last: Record<string, CheckRecord | undefined> = {};
  const lastOk: Record<string, CheckRecord | undefined> = {};
  for (const r of lastRows.map(mapCheck)) last[r.product_id] = r;
  for (const r of okRows.map(mapCheck)) lastOk[r.product_id] = r;
  return { last, lastOk };
}

// ── Store state / events ────────────────────────────────────────────────────

export async function listStoreStates(
  householdId: string,
  productId?: string,
): Promise<StoreState[]> {
  const rows = productId
    ? await query<Row>`
        SELECT * FROM restock_store_state
        WHERE household_id = ${householdId} AND product_id = ${productId}
        ORDER BY distance_miles ASC NULLS LAST, name ASC
      `
    : await query<Row>`
        SELECT * FROM restock_store_state
        WHERE household_id = ${householdId}
        ORDER BY distance_miles ASC NULLS LAST, name ASC
      `;
  return rows.map(mapStoreState);
}

/**
 * Persist a transition plan. Returns the inserted events, including which
 * ones should alert, so the caller can enqueue notifications.
 */
export async function applyTransitionPlan(input: {
  householdId: string;
  productId: string;
  checkId: string;
  plan: TransitionPlan;
}): Promise<Array<StockEvent & { alert: boolean }>> {
  const { householdId, productId, checkId, plan } = input;

  for (const u of plan.upserts) {
    await query`
      INSERT INTO restock_store_state (
        household_id, product_id, store_id, name, address1, address2, city,
        state_code, postal_code, phone, directions_url, distance_miles,
        availability, detail, last_observed_at, available_since, last_change_at
      ) VALUES (
        ${householdId}, ${productId}, ${u.storeId}, ${u.name}, ${u.address1}, ${u.address2}, ${u.city},
        ${u.stateCode}, ${u.postalCode}, ${u.phone}, ${u.directionsUrl}, ${u.distanceMiles},
        ${u.availability}, ${u.detail}, ${u.lastObservedAt}, ${u.availableSince}, ${u.lastChangeAt}
      )
      ON CONFLICT (product_id, store_id) DO UPDATE SET
        name = EXCLUDED.name,
        address1 = EXCLUDED.address1,
        address2 = EXCLUDED.address2,
        city = EXCLUDED.city,
        state_code = EXCLUDED.state_code,
        postal_code = EXCLUDED.postal_code,
        phone = EXCLUDED.phone,
        directions_url = EXCLUDED.directions_url,
        distance_miles = EXCLUDED.distance_miles,
        availability = EXCLUDED.availability,
        detail = EXCLUDED.detail,
        last_observed_at = EXCLUDED.last_observed_at,
        available_since = EXCLUDED.available_since,
        last_change_at = COALESCE(EXCLUDED.last_change_at, restock_store_state.last_change_at)
    `;
  }

  for (const a of plan.absent) {
    await query`
      UPDATE restock_store_state
      SET availability = ${a.availability},
          detail = ${a.detail},
          available_since = NULL,
          last_change_at = now()
      WHERE product_id = ${productId} AND store_id = ${a.storeId}
    `;
  }

  const inserted: Array<StockEvent & { alert: boolean }> = [];
  for (const e of plan.events) {
    const row = await queryOne<Row>`
      INSERT INTO restock_stock_events (
        household_id, product_id, check_id, store_id, store_name, from_availability, to_availability
      ) VALUES (
        ${householdId}, ${productId}, ${checkId}, ${e.storeId}, ${e.storeName}, ${e.from}, ${e.to}
      )
      RETURNING *
    `;
    if (row) inserted.push({ ...mapEvent(row), alert: e.alert });
  }
  return inserted;
}

export async function listRecentEvents(householdId: string, limit = 25): Promise<StockEvent[]> {
  const rows = await query<Row>`
    SELECT * FROM restock_stock_events
    WHERE household_id = ${householdId}
    ORDER BY observed_at DESC
    LIMIT ${limit}
  `;
  return rows.map(mapEvent);
}

// ── Alerts ──────────────────────────────────────────────────────────────────

export async function insertAlert(input: {
  householdId: string;
  productId: string | null;
  eventId: string | null;
  storeId: string | null;
  kind: AlertRecord["kind"];
  recipients: string[];
  subject: string;
  body: string;
}): Promise<AlertRecord> {
  const row = await queryOne<Row>`
    INSERT INTO restock_alerts (
      household_id, product_id, event_id, store_id, kind, recipients, subject, body
    ) VALUES (
      ${input.householdId}, ${input.productId}, ${input.eventId}, ${input.storeId},
      ${input.kind}, ${input.recipients}::text[], ${input.subject}, ${input.body}
    )
    RETURNING *
  `;
  if (!row) throw new Error("Could not queue alert");
  return mapAlert(row);
}

/** Pending alerts whose retry time has arrived. */
export async function listDueAlerts(householdId: string, limit = 10): Promise<AlertRecord[]> {
  const rows = await query<Row>`
    SELECT * FROM restock_alerts
    WHERE household_id = ${householdId}
      AND status = 'pending'
      AND next_attempt_at <= now()
      AND attempts < ${MAX_ALERT_ATTEMPTS}
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
  return rows.map(mapAlert);
}

export async function markAlertSent(alertId: string, providerMessageId: string | null): Promise<void> {
  await query`
    UPDATE restock_alerts
    SET status = 'sent', sent_at = now(), attempts = attempts + 1,
        provider_message_id = ${providerMessageId}, last_error = NULL
    WHERE id = ${alertId} AND status <> 'sent'
  `;
}

export async function markAlertFailed(alert: AlertRecord, error: string): Promise<void> {
  const attempts = alert.attempts + 1;
  const retry = planDeliveryRetry(attempts);
  const delaySecs = Math.ceil(retry.delayMs / 1000);
  await query`
    UPDATE restock_alerts
    SET attempts = ${attempts},
        last_error = ${error.slice(0, 1000)},
        status = ${retry.status},
        next_attempt_at = now() + make_interval(secs => ${delaySecs})
    WHERE id = ${alert.id}
  `;
}

export async function listRecentAlerts(householdId: string, limit = 20): Promise<AlertRecord[]> {
  const rows = await query<Row>`
    SELECT * FROM restock_alerts
    WHERE household_id = ${householdId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(mapAlert);
}
