import type { CheckResult, StoreObservation } from "@restock/types";

/**
 * Best Buy in-store availability.
 *
 * Product identity (verified 2026-11-08):
 *  - Public URL: /product/switch-2-the-legend-of-zelda-40th-anniversary-edition/J7GSL57HTY
 *  - Numeric SKU 13234053 (same title on /site/questions/…/13234053)
 *
 * Live storefront access could not be validated from this environment:
 *  - IDE browser: ERR_HTTP2_PROTOCOL_ERROR
 *  - curl HTTP/1.1: timed out with 0 bytes
 *  - Playwright (Chrome headless, with and without --disable-http2): navigation timeout
 * The official Stores/Products availability API *did* respond (403 without a
 * key, documented JSON error shape). That is the only verified contract.
 *
 * Documented real-time availability (developer.bestbuy.com):
 *   GET https://api.bestbuy.com/v1/products/{sku}/stores.json?postalCode=…&apiKey=…
 * Returns only stores that currently have the SKU in stock (≤ 250 miles).
 * Fields used: ispuEligible, stores[].storeID, name, address, city, state,
 * postalCode, storeType, minPickupHours, lowStock, distance.
 *
 * Empty `stores` is "none listed as in stock", never "every nearby store is
 * sold out" — we do not receive unavailable stores from this endpoint.
 */

export const BESTBUY_API_BASE = "https://api.bestbuy.com/v1";
export const BESTBUY_SITE = "https://www.bestbuy.com";

export function bestBuyAvailabilityUrl(opts: {
  sku: string;
  postalCode: string;
  apiKey: string;
}): string {
  const params = new URLSearchParams({
    postalCode: opts.postalCode,
    apiKey: opts.apiKey,
    format: "json",
  });
  return `${BESTBUY_API_BASE}/products/${encodeURIComponent(opts.sku)}/stores.json?${params.toString()}`;
}

/** Redact the API key for logs / stored errors. */
export function redactBestBuyKey(text: string): string {
  return text.replace(/apiKey=[^&\s"']+/gi, "apiKey=***");
}

export function looksLikeBestBuyBlock(body: string): boolean {
  const head = body.slice(0, 6000);
  return (
    /Attention Required!\s*\|\s*Cloudflare/i.test(head) ||
    /<title>\s*Access Denied/i.test(head) ||
    /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(head) ||
    /challenge-platform/i.test(head)
  );
}

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function directionsUrl(parts: Array<string | null>): string | null {
  const dest = parts.filter(Boolean).join(", ");
  if (!dest) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

export function mapBestBuyStore(raw: unknown): StoreObservation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const storeId = str(r.storeID) ?? str(r.storeId);
  const name = str(r.name) ?? str(r.longName);
  if (!storeId || !name) return null;
  const address1 = str(r.address) ?? str(r.address1);
  const address2 = str(r.address2);
  const city = str(r.city);
  const region = str(r.state) ?? str(r.region);
  const postalCode = str(r.postalCode);
  const parts: string[] = [];
  if (r.lowStock === true) parts.push("Low stock");
  parts.push("Available for store pickup");
  return {
    storeId,
    name,
    address1,
    address2,
    city,
    stateCode: region,
    postalCode,
    phone: str(r.phone),
    directionsUrl: directionsUrl([address1, address2, city, region, postalCode]),
    distanceMiles: num(r.distance),
    availability: "available",
    detail: parts.join(" · "),
  };
}

export function filterStoresByRadius(
  stores: StoreObservation[],
  radiusMiles: number,
): StoreObservation[] {
  return stores.filter(
    (s) => s.distanceMiles === null || s.distanceMiles <= radiusMiles,
  );
}

export type BestBuyParseInput = {
  status: number;
  contentType: string | null;
  body: string;
  /** User-selected radius; API postal searches always cover ~250 miles. */
  radiusMiles?: number;
};

function jsonErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const msg = (json as Raw).errorMessage;
  return typeof msg === "string" && msg.trim() ? msg.trim() : null;
}

export function parseBestBuyResponse(input: BestBuyParseInput): CheckResult {
  const base = {
    method: "api" as const,
    stores: [] as StoreObservation[],
    coversAllStoresInRange: false,
  };

  if (looksLikeBestBuyBlock(input.body)) {
    return {
      ...base,
      status: "blocked",
      error: "Best Buy returned a block/challenge page",
    };
  }

  let json: unknown = null;
  try {
    json = JSON.parse(input.body);
  } catch {
    json = null;
  }
  const apiMessage = jsonErrorMessage(json);

  if (input.status === 403 || input.status === 429) {
    return {
      ...base,
      status: "blocked",
      error: redactBestBuyKey(
        apiMessage
          ? `Best Buy API: ${apiMessage} (HTTP ${input.status})`
          : `Best Buy API refused the request (HTTP ${input.status}); check BESTBUY_API_KEY and quota`,
      ),
    };
  }
  if (input.status < 200 || input.status >= 300) {
    return {
      ...base,
      status: "error",
      error: redactBestBuyKey(
        apiMessage
          ? `Best Buy API: ${apiMessage} (HTTP ${input.status})`
          : `Best Buy API responded with HTTP ${input.status}`,
      ),
    };
  }
  if (json === null) {
    return { ...base, status: "malformed", error: "Best Buy API response was not JSON" };
  }
  if (typeof json !== "object") {
    return { ...base, status: "malformed", error: "Best Buy API JSON was not an object" };
  }
  const stores = (json as Raw).stores;
  if (!Array.isArray(stores)) {
    return {
      ...base,
      status: "malformed",
      error: redactBestBuyKey(
        apiMessage ? `Best Buy API: ${apiMessage}` : "Best Buy API JSON is missing the `stores` array",
      ),
    };
  }
  const mapped = stores
    .map(mapBestBuyStore)
    .filter((s): s is StoreObservation => Boolean(s));
  if (stores.length > 0 && mapped.length === 0) {
    return {
      ...base,
      status: "malformed",
      error: "Best Buy store entries did not match the expected shape",
    };
  }
  const radius = input.radiusMiles;
  const filtered =
    typeof radius === "number" && Number.isFinite(radius)
      ? filterStoresByRadius(mapped, radius)
      : mapped;
  return { ...base, status: "ok", error: null, stores: filtered };
}
