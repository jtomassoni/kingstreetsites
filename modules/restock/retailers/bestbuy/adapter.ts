import {
  browserSupported,
  looksLikeChallengeTitle,
  withBrowserSession,
  type BrowserSession,
} from "@restock/lib/browser";
import { REQUEST_TIMEOUT_MS } from "@restock/lib/scheduling";
import {
  BESTBUY_SITE,
  bestBuyAvailabilityUrl,
  parseBestBuyFulfillment,
  parseBestBuyResponse,
  redactBestBuyKey,
} from "@restock/retailers/bestbuy/parse";
import {
  errorMessage,
  fetchWithTimeout,
  type CheckContext,
  type RetailerAdapter,
} from "@restock/retailers/types";
import type { CheckResult, TrackedProduct } from "@restock/types";
import type { Response } from "playwright-core";

export const BESTBUY_CONFIG_HINT =
  "Best Buy is checked by loading the public product page in headed Chrome (same as hitting refresh). Headless/datacenter browsers are blocked.";

function apiKey(): string | null {
  const key = process.env.BESTBUY_API_KEY?.trim();
  return key ? key : null;
}

async function checkViaApi(
  product: TrackedProduct,
  ctx: CheckContext,
  key: string,
): Promise<CheckResult> {
  const url = bestBuyAvailabilityUrl({
    sku: product.retailer_product_id,
    postalCode: ctx.postalCode,
    apiKey: key,
  });
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
      timeoutMs: REQUEST_TIMEOUT_MS,
      signal: ctx.signal,
    });
    return parseBestBuyResponse({ ...res, radiusMiles: ctx.radiusMiles });
  } catch (err) {
    return {
      status: "error",
      method: "api",
      stores: [],
      error: redactBestBuyKey(errorMessage(err, "Best Buy API request failed")),
      coversAllStoresInRange: false,
    };
  }
}

type FulfillmentCapture = { status: number; body: string };

function scoreFulfillment(body: string): number {
  try {
    const json = JSON.parse(body) as {
      data?: { fulfillmentOptions?: { ispuDetails?: unknown[]; buttonStates?: unknown[] } };
    };
    const fo = json.data?.fulfillmentOptions;
    if (!fo) return -1;
    let score = 1;
    if (Array.isArray(fo.buttonStates) && fo.buttonStates.length) score += 1;
    const ispu = Array.isArray(fo.ispuDetails) ? fo.ispuDetails : [];
    if (ispu.length) score += 2;
    for (const entry of ispu) {
      if (entry && typeof entry === "object" && Array.isArray((entry as { nearbyLocations?: unknown }).nearbyLocations)) {
        const n = (entry as { nearbyLocations: unknown[] }).nearbyLocations.length;
        score += Math.min(n, 5);
      }
    }
    return score;
  } catch {
    return -1;
  }
}

async function collectFulfillment(
  session: BrowserSession,
  productUrl: string,
  postalCode: string,
): Promise<FulfillmentCapture | null> {
  const { page, context } = session;
  const found: FulfillmentCapture[] = [];
  const onResponse = async (res: Response) => {
    if (!res.url().includes("/gateway/graphql/fulfillment?")) return;
    const body = await res.text().catch(() => "");
    if (body.startsWith("{")) found.push({ status: res.status(), body });
  };
  page.on("response", onResponse);
  try {
    await context.addCookies([
      {
        name: "customerZipCode",
        value: `${postalCode}|N`,
        domain: ".bestbuy.com",
        path: "/",
      },
    ]);
    const response = await page.goto(productUrl, { waitUntil: "domcontentloaded" });
    const pageStatus = response?.status() ?? 0;
    const title = (await page.title().catch(() => "")) || "";
    if (pageStatus === 403 || pageStatus === 429 || looksLikeChallengeTitle(title)) {
      return {
        status: pageStatus || 403,
        body: `<html><title>${title}</title></html>`,
      };
    }
    await page.waitForLoadState("load").catch(() => undefined);
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && found.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  } finally {
    page.off("response", onResponse);
  }
  if (found.length === 0) return null;
  return found.slice().sort((a, b) => scoreFulfillment(b.body) - scoreFulfillment(a.body))[0];
}

async function checkViaBrowserPage(
  product: TrackedProduct,
  ctx: CheckContext,
  session: BrowserSession,
): Promise<CheckResult> {
  const captured = await collectFulfillment(
    session,
    product.product_url,
    ctx.postalCode,
  );
  if (!captured) {
    return {
      status: "blocked",
      method: "browser",
      stores: [],
      error: "Best Buy product page loaded but did not fire its in-store fulfillment request",
      coversAllStoresInRange: false,
    };
  }
  return parseBestBuyFulfillment({
    ...captured,
    radiusMiles: ctx.radiusMiles,
  });
}

async function checkViaBrowser(
  product: TrackedProduct,
  ctx: CheckContext,
): Promise<CheckResult> {
  try {
    if (ctx.browser) return await checkViaBrowserPage(product, ctx, ctx.browser);
    if (ctx.skipBrowserLaunch) {
      return {
        status: "blocked",
        method: "browser",
        stores: [],
        error: "Best Buy needs a browser session (deferred)",
        coversAllStoresInRange: false,
      };
    }
    if (!browserSupported()) {
      return {
        status: "blocked",
        method: "browser",
        stores: [],
        error: "Best Buy storefront needs headed Chrome on this Mac",
        coversAllStoresInRange: false,
      };
    }
    return await withBrowserSession((session) =>
      checkViaBrowserPage(product, ctx, session),
    );
  } catch (err) {
    return {
      status: "error",
      method: "browser",
      stores: [],
      error: `Best Buy browser check failed: ${errorMessage(err, "unknown error")}`,
      coversAllStoresInRange: false,
    };
  }
}

export const bestbuyAdapter: RetailerAdapter = {
  id: "bestbuy",
  label: "Best Buy",
  isConfigured: () => browserSupported() || Boolean(apiKey()),
  configurationHint: BESTBUY_CONFIG_HINT,
  productUrl: (product) =>
    product.product_url ||
    `${BESTBUY_SITE}/site/searchpage.jsp?st=${encodeURIComponent(product.retailer_product_id)}`,
  async check(product, ctx) {
    const key = apiKey();
    if (browserSupported() || ctx.browser) {
      return checkViaBrowser(product, ctx);
    }
    if (key) return checkViaApi(product, ctx, key);
    return {
      status: "skipped",
      method: "browser",
      stores: [],
      error: BESTBUY_CONFIG_HINT,
      coversAllStoresInRange: false,
    };
  },
};
