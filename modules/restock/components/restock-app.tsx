"use client";

import { useMemo, useState, useTransition } from "react";
import {
  checkNowAction,
  getDashboardAction,
  sendTestNotificationAction,
  setProductEnabledAction,
  updateSettingsAction,
} from "@restock/actions/restock";
import { formatCheckTime, formatStoreAddress } from "@restock/lib/format";
import {
  RADIUS_OPTIONS,
  type Availability,
  type CheckRecord,
  type CheckStatus,
  type RestockDashboardData,
  type RetailerId,
  type StoreState,
  type TrackedProduct,
} from "@restock/types";

const RETAILER_LABEL: Record<RetailerId, string> = {
  gamestop: "GameStop",
  bestbuy: "Best Buy",
};

type Props = { initial: RestockDashboardData };

function statusLabel(status: CheckStatus): string {
  switch (status) {
    case "ok":
      return "OK";
    case "blocked":
      return "Blocked";
    case "degraded":
      return "Degraded";
    case "malformed":
      return "Malformed";
    case "error":
      return "Failed";
    case "skipped":
      return "Skipped";
  }
}

function availabilityLabel(value: Availability): string {
  switch (value) {
    case "available":
      return "Available";
    case "unavailable":
      return "Unavailable";
    case "unknown":
      return "Unknown";
  }
}

function availabilityClass(value: Availability): string {
  switch (value) {
    case "available":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "unavailable":
      return "bg-ink/[0.04] text-ink-muted ring-ink/10";
    case "unknown":
      return "bg-amber-50 text-amber-900 ring-amber-200";
  }
}

function checkTone(status: CheckStatus | undefined): string {
  if (!status) return "text-ink-muted";
  if (status === "ok") return "text-emerald-800";
  if (status === "skipped") return "text-ink-muted";
  return "text-rose-700";
}

function isStale(lastOk: CheckRecord | undefined, last: CheckRecord | undefined): boolean {
  if (!lastOk) return Boolean(last && last.status !== "ok");
  if (last && last.status !== "ok") return true;
  const t = Date.parse(lastOk.finished_at ?? lastOk.started_at);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > 15 * 60 * 1000;
}

export function RestockApp({ initial }: Props) {
  const [data, setData] = useState(initial);
  const [zip, setZip] = useState(initial.settings.postal_code);
  const [radius, setRadius] = useState(String(initial.settings.radius_miles));
  const [emails, setEmails] = useState(initial.settings.alert_emails.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(next: RestockDashboardData) {
    setData(next);
    setZip(next.settings.postal_code);
    setRadius(String(next.settings.radius_miles));
    setEmails(next.settings.alert_emails.join(", "));
  }

  function refresh() {
    startTransition(async () => {
      const res = await getDashboardAction();
      if (res.data) apply(res.data);
      if (res.error) setError(res.error);
    });
  }

  const storesByProduct = useMemo(() => {
    const map = new Map<string, StoreState[]>();
    for (const store of data.stores) {
      const list = map.get(store.product_id) ?? [];
      list.push(store);
      map.set(store.product_id, list);
    }
    return map;
  }, [data.stores]);

  function saveSettings(patch: Parameters<typeof updateSettingsAction>[0]) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await updateSettingsAction(patch);
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage("Saved.");
      refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand sm:text-sm">
            Restock Tracker
          </p>
          <h1 className="mt-1 font-serif text-[1.85rem] leading-tight tracking-tight text-ink sm:mt-2 sm:text-4xl">
            Nearby inventory
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            GameStop and Best Buy for the Zelda 40th Anniversary Switch 2.
            Online listings can lag what is actually on the shelf — call before
            you drive.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setMessage(null);
            startTransition(async () => {
              const res = await checkNowAction();
              if (res.error) setError(res.error);
              else if (res.summary) {
                const available = res.summary.results.reduce(
                  (n, r) => n + r.availableCount,
                  0,
                );
                setMessage(
                  res.summary.success
                    ? `Checked ${res.summary.results.length} retailer${res.summary.results.length === 1 ? "" : "s"} · ${available} store${available === 1 ? "" : "s"} showing stock`
                    : "Check finished with errors — see retailer status below.",
                );
              }
              refresh();
            });
          }}
          className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-cream disabled:opacity-50"
        >
          {pending ? "Working…" : "Check now"}
        </button>
      </header>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 rounded-xl border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-brand-dark">
          {message}
        </p>
      ) : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-ink/[0.06] bg-white p-4">
          <h2 className="text-sm font-semibold text-ink">Monitoring</h2>
          <p className="mt-1 text-lg font-medium text-ink">
            {data.settings.monitoring_enabled ? "Enabled" : "Disabled"}
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            Last attempted:{" "}
            {data.settings.last_attempted_at
              ? formatCheckTime(data.settings.last_attempted_at)
              : "never"}
          </p>
          <p className="text-xs text-ink-muted">
            Last successful:{" "}
            {data.settings.last_success_at
              ? formatCheckTime(data.settings.last_success_at)
              : "never"}
          </p>
          {!data.cronConfigured ? (
            <p className="mt-2 text-xs text-amber-800">
              Cron is not authenticated yet (set CRON_SECRET on Vercel). Five-minute
              checks will not run in production until that is set.
            </p>
          ) : (
            <p className="mt-2 text-xs text-ink-muted">
              Vercel cron is configured for every 5 minutes. Monitoring is not
              confirmed live until a scheduled check has succeeded after deploy.
            </p>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              saveSettings({ monitoringEnabled: !data.settings.monitoring_enabled })
            }
            className="mt-3 text-sm font-semibold text-brand hover:text-brand-dark disabled:opacity-50"
          >
            {data.settings.monitoring_enabled ? "Disable monitoring" : "Enable monitoring"}
          </button>
        </div>

        <div className="rounded-2xl border border-ink/[0.06] bg-white p-4">
          <h2 className="text-sm font-semibold text-ink">Notifications</h2>
          {data.notifications.configured ? (
            <p className="mt-1 text-sm text-ink">
              Emails go to {data.notifications.recipients.join(", ")}
            </p>
          ) : (
            <p className="mt-1 text-sm font-medium text-amber-900">
              Notifications not configured
              {data.notifications.reason ? ` — ${data.notifications.reason}` : ""}
            </p>
          )}
          <label className="mt-3 block text-xs font-medium text-ink-muted">
            Alert emails
            <input
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              onBlur={() => {
                if (emails.trim() !== data.settings.alert_emails.join(", ")) {
                  saveSettings({ alertEmails: emails });
                }
              }}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-lg border border-ink/10 bg-cream px-2.5 py-2 text-sm text-ink"
            />
          </label>
          {data.isSuperAdmin ? (
            <button
              type="button"
              disabled={pending || !data.notifications.configured}
              onClick={() => {
                setError(null);
                setMessage(null);
                startTransition(async () => {
                  const res = await sendTestNotificationAction();
                  if (res.error) setError(res.error);
                  else setMessage(`Test notification sent to ${res.recipients?.join(", ")}`);
                  refresh();
                });
              }}
              className="mt-3 text-sm font-semibold text-brand hover:text-brand-dark disabled:opacity-50"
            >
              Send test notification
            </button>
          ) : null}
        </div>
      </section>

      <form
        className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-ink/[0.06] bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveSettings({ postalCode: zip, radiusMiles: Number(radius) });
        }}
      >
        <label className="text-xs font-medium text-ink-muted">
          ZIP
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            inputMode="numeric"
            maxLength={5}
            className="mt-1 block w-28 rounded-lg border border-ink/10 bg-cream px-2.5 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-xs font-medium text-ink-muted">
          Radius
          <select
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            className="mt-1 block rounded-lg border border-ink/10 bg-cream px-2.5 py-2 text-sm text-ink"
          >
            {RADIUS_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} miles
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-ink/10 bg-cream px-3 py-2 text-sm font-medium text-ink disabled:opacity-50"
        >
          Update area
        </button>
      </form>

      <ul className="mt-6 space-y-4">
        {data.products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            stores={storesByProduct.get(product.id) ?? []}
            last={data.lastCheckByProduct[product.id]}
            lastOk={data.lastOkCheckByProduct[product.id]}
            provider={data.providers.find((p) => p.retailer === product.retailer)}
            pending={pending}
            onToggle={(enabled) => {
              setError(null);
              startTransition(async () => {
                const res = await setProductEnabledAction({
                  productId: product.id,
                  enabled,
                });
                if (res.error) setError(res.error);
                refresh();
              });
            }}
          />
        ))}
      </ul>

      <section className="mt-8">
        <h2 className="font-serif text-xl text-ink">Recent stock changes</h2>
        {data.recentEvents.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            No availability changes recorded yet. Failed checks never invent a
            restock.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-ink/[0.06] rounded-2xl border border-ink/[0.06] bg-white">
            {data.recentEvents.map((event) => (
              <li key={event.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-ink">
                  {event.store_name}{" "}
                  <span className="font-normal text-ink-muted">
                    {event.from_availability ?? "new"} → {event.to_availability}
                  </span>
                </p>
                <p className="text-xs text-ink-muted">
                  {formatCheckTime(event.observed_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProductCard({
  product,
  stores,
  last,
  lastOk,
  provider,
  pending,
  onToggle,
}: {
  product: TrackedProduct;
  stores: StoreState[];
  last: CheckRecord | undefined;
  lastOk: CheckRecord | undefined;
  provider: RestockDashboardData["providers"][number] | undefined;
  pending: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const retailerLabel = RETAILER_LABEL[product.retailer];
  const available = stores.filter((s) => s.availability === "available");
  const stale = isStale(lastOk, last);
  const verified = provider?.verified === true;

  return (
    <li className="rounded-2xl border border-ink/[0.06] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-brand">
            {retailerLabel}
          </p>
          <h3 className="mt-0.5 font-serif text-lg text-ink">{product.title}</h3>
          <p className={`mt-1 text-xs ${checkTone(last?.status)}`}>
            {last
              ? `${statusLabel(last.status)} · ${last.method ?? "—"} · ${formatCheckTime(last.started_at)}`
              : "No check yet"}
            {stale ? " · stale / unverified" : ""}
          </p>
          {lastOk ? (
            <p className="text-xs text-ink-muted">
              Last successful check {formatCheckTime(lastOk.finished_at ?? lastOk.started_at)}
            </p>
          ) : (
            <p className="text-xs text-amber-800">
              {provider?.note ?? "Provider unverified — no successful live check yet"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={product.product_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-brand hover:text-brand-dark"
          >
            Product page
          </a>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={product.enabled}
              disabled={pending}
              onChange={(e) => onToggle(e.target.checked)}
            />
            Track
          </label>
        </div>
      </div>

      {!verified ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {provider?.configured
            ? provider.note ?? "Unverified — do not treat missing stores as sold out."
            : provider?.note ?? "Provider not configured."}
        </p>
      ) : last && last.status !== "ok" ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
          Last check failed ({statusLabel(last.status)}
          {last.error ? `: ${last.error}` : ""}). Previous store state is kept;
          this is not a restock or a sell-out.
        </p>
      ) : null}

      {last?.status === "ok" && stores.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">
          {product.retailer === "bestbuy"
            ? "No nearby stores currently listed as in stock. Best Buy only returns stores that have the item — this is not a complete sold-out census."
            : "No stores returned in this ZIP/radius. That is not the same as every store being sold out."}
        </p>
      ) : null}

      {available.length > 0 ? (
        <StoreList stores={available} heading="In stock" />
      ) : null}
      {stores.some((s) => s.availability !== "available") ? (
        <StoreList
          stores={stores.filter((s) => s.availability !== "available")}
          heading="Other stores"
        />
      ) : null}
    </li>
  );
}

function StoreList({
  stores,
  heading,
}: {
  stores: StoreState[];
  heading: string;
}) {
  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
        {heading}
      </h4>
      <ul className="mt-2 space-y-2">
        {stores.map((store) => {
          const address = formatStoreAddress(store);
          return (
            <li
              key={store.id}
              className="rounded-xl border border-ink/[0.06] bg-cream/60 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">{store.name}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${availabilityClass(store.availability)}`}
                >
                  {availabilityLabel(store.availability)}
                </span>
              </div>
              {address ? (
                <p className="mt-0.5 text-xs text-ink-muted">{address}</p>
              ) : null}
              <p className="mt-0.5 text-xs text-ink-muted">
                {store.distance_miles !== null
                  ? `${store.distance_miles.toFixed(1)} mi`
                  : "Distance unknown"}
                {store.phone ? ` · ${store.phone}` : ""}
                {store.detail ? ` · ${store.detail}` : ""}
              </p>
              <p className="text-[11px] text-ink-faint">
                Last successful check:{" "}
                {store.last_observed_at
                  ? formatCheckTime(store.last_observed_at)
                  : "not yet observed"}
              </p>
              {store.directions_url ? (
                <a
                  href={store.directions_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs font-semibold text-brand hover:text-brand-dark"
                >
                  Directions
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
