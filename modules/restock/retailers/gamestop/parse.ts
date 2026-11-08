import type { Availability, CheckResult, StoreObservation } from "@restock/types";

/**
 * GameStop storefront (Salesforce Commerce Cloud / Demandware).
 *
 * Verified 2026-11-08 from a real browser session against
 *   /on/demandware.store/Sites-gamestop-us-Site/default/Stores-FindStores
 *     ?postalCode=80219&radius=30&products=451607:1
 * which returns *every* store in range, each decorated with product inventory
 * fields when `products` is passed. `Stores-InventorySearch` uses the same
 * store shape but only lists stores that currently have the item.
 *
 * Observed store fields used here: ID, name, address1, address2, city,
 * stateCode, postalCode, phone, storeDirectionsUrl, distance (string miles),
 * isInStock (boolean), isLimitedStock (boolean), conditionsInStock (string[]),
 * inventory ([{ sku, count }]).
 */

export const GAMESTOP_SITE = "https://www.gamestop.com";
export const GAMESTOP_FIND_STORES_PATH =
  "/on/demandware.store/Sites-gamestop-us-Site/default/Stores-FindStores";
export const GAMESTOP_INVENTORY_SEARCH_PATH =
  "/on/demandware.store/Sites-gamestop-us-Site/default/Stores-InventorySearch";

export function gamestopFindStoresUrl(opts: {
  productId: string;
  postalCode: string;
  radius: number;
}): string {
  const params = new URLSearchParams({
    postalCode: opts.postalCode,
    radius: String(opts.radius),
    products: `${opts.productId}:1`,
  });
  return `${GAMESTOP_SITE}${GAMESTOP_FIND_STORES_PATH}?${params.toString()}`;
}

export function gamestopProductUrl(productId: string, slug?: string): string {
  const path = slug
    ? `/consoles-hardware/nintendo-switch-2/products/${slug}/${productId}.html`
    : `/products/${productId}.html`;
  return `${GAMESTOP_SITE}${path}`;
}

/** Cloudflare WAF block / managed challenge pages. */
export function looksLikeCloudflareBlock(body: string): boolean {
  const head = body.slice(0, 6000);
  return (
    /Attention Required!\s*\|\s*Cloudflare/i.test(head) ||
    /Sorry, you have been blocked/i.test(head) ||
    /cf-error-details/i.test(head) ||
    /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(head) ||
    /challenge-platform/i.test(head)
  );
}

type RawStore = Record<string, unknown>;

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
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function availabilityFor(raw: RawStore): {
  availability: Availability;
  detail: string | null;
} {
  const isInStock = raw.isInStock;
  if (typeof isInStock !== "boolean") {
    return { availability: "unknown", detail: "No inventory data returned" };
  }
  if (isInStock) {
    const conditions = Array.isArray(raw.conditionsInStock)
      ? raw.conditionsInStock.filter((c): c is string => typeof c === "string")
      : [];
    const parts: string[] = [];
    if (raw.isLimitedStock === true) parts.push("Limited stock");
    if (conditions.length) parts.push(conditions.join(", "));
    return {
      availability: "available",
      detail: parts.length ? parts.join(" · ") : "In stock",
    };
  }
  const inv = Array.isArray(raw.inventory) ? raw.inventory : [];
  const first = inv[0] as RawStore | undefined;
  const count = first ? num(first.count) : null;
  return {
    availability: "unavailable",
    detail: count === 0 ? "Online shows 0 on hand" : "Not in stock online",
  };
}

export function mapGameStopStore(raw: unknown): StoreObservation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RawStore;
  const storeId = str(r.ID) ?? str(r.id);
  const name = str(r.name);
  if (!storeId || !name) return null;
  const { availability, detail } = availabilityFor(r);
  return {
    storeId,
    name: name.replace(/\s+/g, " ").trim(),
    address1: str(r.address1),
    address2: str(r.address2),
    city: str(r.city),
    stateCode: str(r.stateCode),
    postalCode: str(r.postalCode),
    phone: str(r.phone),
    directionsUrl: str(r.storeDirectionsUrl),
    distanceMiles: num(r.distance),
    availability,
    detail,
  };
}

export type GameStopParseInput = {
  status: number;
  contentType: string | null;
  body: string;
  /** "find" = Stores-FindStores (all stores in range). "inventory" = Stores-InventorySearch (in-stock only). */
  endpoint: "find" | "inventory";
};

/**
 * Pure parser. Never turns an empty or malformed payload into "sold out":
 * - blocked / challenge pages → status "blocked"
 * - non-JSON or missing `stores` array → "malformed"
 * - `stores: []` from Stores-FindStores → ok with zero stores (no stores in range)
 * - `stores: []` from Stores-InventorySearch → ok with zero stores, but
 *   coversAllStoresInRange=false (the list only ever contains in-stock stores)
 */
export function parseGameStopResponse(
  input: GameStopParseInput,
  method: CheckResult["method"] = "direct",
): CheckResult {
  const base = {
    method,
    stores: [] as StoreObservation[],
    coversAllStoresInRange: input.endpoint === "find",
  };

  if (input.status === 403 || input.status === 429 || input.status === 503) {
    return {
      ...base,
      status: "blocked",
      error: `GameStop refused the request (HTTP ${input.status})`,
    };
  }
  if (looksLikeCloudflareBlock(input.body)) {
    return {
      ...base,
      status: "blocked",
      error: "GameStop returned a Cloudflare block/challenge page",
    };
  }
  if (input.status < 200 || input.status >= 300) {
    return {
      ...base,
      status: "error",
      error: `GameStop responded with HTTP ${input.status}`,
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(input.body);
  } catch {
    return {
      ...base,
      status: "malformed",
      error: "GameStop response was not JSON",
    };
  }
  if (!json || typeof json !== "object") {
    return { ...base, status: "malformed", error: "GameStop JSON was not an object" };
  }
  const stores = (json as Record<string, unknown>).stores;
  if (!Array.isArray(stores)) {
    return {
      ...base,
      status: "malformed",
      error: "GameStop JSON is missing the `stores` array",
    };
  }

  const mapped = stores
    .map(mapGameStopStore)
    .filter((s): s is StoreObservation => Boolean(s));
  if (stores.length > 0 && mapped.length === 0) {
    return {
      ...base,
      status: "malformed",
      error: "GameStop store entries did not match the expected shape",
    };
  }

  return { ...base, status: "ok", error: null, stores: mapped };
}
