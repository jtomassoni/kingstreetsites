-- Restock Tracker: local retailer inventory monitoring (GameStop / Best Buy)
-- for hard-to-find items. Household-scoped like the other /tools apps.

CREATE TABLE IF NOT EXISTS public.restock_settings (
  household_id uuid PRIMARY KEY REFERENCES public.households (id) ON DELETE CASCADE,
  postal_code text NOT NULL DEFAULT '80219',
  radius_miles integer NOT NULL DEFAULT 30
    CHECK (radius_miles IN (15, 30, 50, 100)),
  monitoring_enabled boolean NOT NULL DEFAULT true,
  -- Restock alert recipients (editable in the dashboard).
  alert_emails text[] NOT NULL DEFAULT '{}',
  -- Scheduler health
  last_attempted_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  backoff_until timestamptz,
  last_manual_check_at timestamptz,
  -- Overlap protection for scheduled/manual runs
  run_lock_token text,
  run_lock_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS restock_settings_set_updated_at ON public.restock_settings;
CREATE TRIGGER restock_settings_set_updated_at
  BEFORE UPDATE ON public.restock_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.restock_settings IS
  'Per-household Restock Tracker settings plus scheduler lock/backoff state.';

CREATE TABLE IF NOT EXISTS public.restock_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  retailer text NOT NULL CHECK (retailer IN ('gamestop', 'bestbuy')),
  retailer_product_id text NOT NULL,
  title text NOT NULL,
  product_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, retailer, retailer_product_id)
);

DROP TRIGGER IF EXISTS restock_products_set_updated_at ON public.restock_products;
CREATE TRIGGER restock_products_set_updated_at
  BEFORE UPDATE ON public.restock_products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- One row per check attempt per product (cron or manual).
CREATE TABLE IF NOT EXISTS public.restock_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.restock_products (id) ON DELETE CASCADE,
  trigger text NOT NULL CHECK (trigger IN ('cron', 'manual')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  -- ok: parsed successfully. blocked: retailer refused (403/429/challenge).
  -- degraded: response reachable but untrustworthy. malformed: unparseable.
  -- error: network/timeout/other. skipped: provider not configured.
  status text NOT NULL
    CHECK (status IN ('ok', 'blocked', 'degraded', 'malformed', 'error', 'skipped')),
  method text CHECK (method IN ('direct', 'browser', 'api')),
  error text,
  store_count integer,
  available_count integer,
  duration_ms integer
);

CREATE INDEX IF NOT EXISTS restock_checks_product_started_idx
  ON public.restock_checks (product_id, started_at DESC);

-- Last-known state per store per product. Only successful checks update availability.
CREATE TABLE IF NOT EXISTS public.restock_store_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.restock_products (id) ON DELETE CASCADE,
  store_id text NOT NULL,
  name text NOT NULL,
  address1 text,
  address2 text,
  city text,
  state_code text,
  postal_code text,
  phone text,
  directions_url text,
  distance_miles numeric(7, 2),
  availability text NOT NULL DEFAULT 'unknown'
    CHECK (availability IN ('available', 'unavailable', 'unknown')),
  detail text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  -- Last successful check that included this store.
  last_observed_at timestamptz,
  available_since timestamptz,
  last_change_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, store_id)
);

CREATE INDEX IF NOT EXISTS restock_store_state_household_idx
  ON public.restock_store_state (household_id, product_id, distance_miles);

DROP TRIGGER IF EXISTS restock_store_state_set_updated_at ON public.restock_store_state;
CREATE TRIGGER restock_store_state_set_updated_at
  BEFORE UPDATE ON public.restock_store_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Availability transitions (only written when a successful check changes state).
CREATE TABLE IF NOT EXISTS public.restock_stock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.restock_products (id) ON DELETE CASCADE,
  check_id uuid REFERENCES public.restock_checks (id) ON DELETE SET NULL,
  store_id text NOT NULL,
  store_name text NOT NULL,
  from_availability text
    CHECK (from_availability IS NULL OR from_availability IN ('available', 'unavailable', 'unknown')),
  to_availability text NOT NULL
    CHECK (to_availability IN ('available', 'unavailable', 'unknown')),
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS restock_stock_events_household_observed_idx
  ON public.restock_stock_events (household_id, observed_at DESC);

-- Alert delivery state. Sent alerts are never re-sent; failed ones retry with backoff.
CREATE TABLE IF NOT EXISTS public.restock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.restock_products (id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.restock_stock_events (id) ON DELETE SET NULL,
  store_id text,
  kind text NOT NULL CHECK (kind IN ('restock', 'test')),
  recipients text[] NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS restock_alerts_pending_idx
  ON public.restock_alerts (household_id, status, next_attempt_at);

DROP TRIGGER IF EXISTS restock_alerts_set_updated_at ON public.restock_alerts;
CREATE TRIGGER restock_alerts_set_updated_at
  BEFORE UPDATE ON public.restock_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.restock_alerts IS
  'Restock notification queue; preserves failed deliveries for retry without re-sending successes.';
