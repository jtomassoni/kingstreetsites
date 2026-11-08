export const RETAILERS = ["gamestop", "bestbuy"] as const;
export type RetailerId = (typeof RETAILERS)[number];

export const RADIUS_OPTIONS = [15, 30, 50, 100] as const;
export type RadiusMiles = (typeof RADIUS_OPTIONS)[number];

export type Availability = "available" | "unavailable" | "unknown";

/**
 * ok        parsed successfully; store list is trustworthy
 * blocked   retailer refused the request (403/429/bot challenge)
 * degraded  reachable, but the response failed a trust check (e.g. "sold out" for a control item)
 * malformed unexpected payload shape
 * error     network / timeout / unexpected exception
 * skipped   provider not configured (e.g. missing API key)
 */
export type CheckStatus =
  | "ok"
  | "blocked"
  | "degraded"
  | "malformed"
  | "error"
  | "skipped";

export type CheckMethod = "direct" | "browser" | "api";

export type StoreObservation = {
  storeId: string;
  name: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  stateCode: string | null;
  postalCode: string | null;
  phone: string | null;
  directionsUrl: string | null;
  distanceMiles: number | null;
  availability: Availability;
  /** Short human detail, e.g. "Limited stock · New". Never invented. */
  detail: string | null;
};

export type CheckResult = {
  status: CheckStatus;
  method: CheckMethod;
  stores: StoreObservation[];
  /** Human-readable reason for non-ok status. */
  error: string | null;
  /** True when the retailer's response explicitly says it covers all stores in range (vs only in-stock ones). */
  coversAllStoresInRange: boolean;
};

export type TrackedProduct = {
  id: string;
  household_id: string;
  retailer: RetailerId;
  retailer_product_id: string;
  title: string;
  product_url: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type RestockSettings = {
  household_id: string;
  postal_code: string;
  radius_miles: RadiusMiles;
  monitoring_enabled: boolean;
  alert_emails: string[];
  last_attempted_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  backoff_until: string | null;
  last_manual_check_at: string | null;
  run_lock_token: string | null;
  run_lock_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StoreState = {
  id: string;
  household_id: string;
  product_id: string;
  store_id: string;
  name: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state_code: string | null;
  postal_code: string | null;
  phone: string | null;
  directions_url: string | null;
  distance_miles: number | null;
  availability: Availability;
  detail: string | null;
  first_seen_at: string;
  last_observed_at: string | null;
  available_since: string | null;
  last_change_at: string | null;
  updated_at: string;
};

export type CheckRecord = {
  id: string;
  household_id: string;
  product_id: string;
  trigger: "cron" | "manual";
  started_at: string;
  finished_at: string | null;
  status: CheckStatus;
  method: CheckMethod | null;
  error: string | null;
  store_count: number | null;
  available_count: number | null;
  duration_ms: number | null;
};

export type StockEvent = {
  id: string;
  household_id: string;
  product_id: string;
  check_id: string | null;
  store_id: string;
  store_name: string;
  from_availability: Availability | null;
  to_availability: Availability;
  observed_at: string;
};

export type AlertRecord = {
  id: string;
  household_id: string;
  product_id: string | null;
  event_id: string | null;
  store_id: string | null;
  kind: "restock" | "test";
  recipients: string[];
  subject: string;
  body: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  sent_at: string | null;
  provider_message_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProviderStatus = {
  retailer: RetailerId;
  label: string;
  /** Config present (API key etc.). */
  configured: boolean;
  /** A successful, parseable check has been recorded. */
  verified: boolean;
  note: string | null;
};

export type NotificationStatus = {
  configured: boolean;
  recipients: string[];
  fromEmail: string | null;
  reason: string | null;
};

export type RestockDashboardData = {
  settings: RestockSettings;
  products: TrackedProduct[];
  stores: StoreState[];
  recentChecks: CheckRecord[];
  recentEvents: StockEvent[];
  recentAlerts: AlertRecord[];
  providers: ProviderStatus[];
  notifications: NotificationStatus;
  /** Latest check per product id. */
  lastCheckByProduct: Record<string, CheckRecord | undefined>;
  /** Latest *successful* check per product id. */
  lastOkCheckByProduct: Record<string, CheckRecord | undefined>;
  isSuperAdmin: boolean;
  cronConfigured: boolean;
};
