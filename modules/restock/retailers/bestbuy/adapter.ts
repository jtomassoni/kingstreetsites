import {
  browserSupported,
  withBrowserSession,
  type BrowserSession,
} from "@restock/lib/browser";
import { REQUEST_TIMEOUT_MS } from "@restock/lib/scheduling";
import {
  BESTBUY_SITE,
  bestBuyAvailabilityUrl,
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

export const BESTBUY_CONFIG_HINT =
  "Best Buy’s public storefront could not be validated (HTTP/2 errors / timeouts from automated sessions). Set BESTBUY_API_KEY from developer.bestbuy.com for the documented in-store availability API. Browser fallback is attempted but currently unverified.";

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

async function checkViaBrowserPage(
  product: TrackedProduct,
  _ctx: CheckContext,
  session: BrowserSession,
): Promise<CheckResult> {
  const page = session.page;
  const response = await page.goto(product.product_url, {
    waitUntil: "domcontentloaded",
  });
  const pageStatus = response?.status() ?? 0;
  if (pageStatus === 403 || pageStatus === 429 || pageStatus === 0) {
    return {
      status: "blocked",
      method: "browser",
      stores: [],
      error: `Best Buy blocked or failed the product page (HTTP ${pageStatus || "timeout"})`,
      coversAllStoresInRange: false,
    };
  }
  const title = (await page.title().catch(() => "")) || "unknown";
  return {
    status: "blocked",
    method: "browser",
    stores: [],
    error: `Best Buy product page loaded (HTTP ${pageStatus}, “${title}”) but in-store JSON is not documented without BESTBUY_API_KEY`,
    coversAllStoresInRange: false,
  };
}

async function checkViaBrowser(
  product: TrackedProduct,
  ctx: CheckContext,
): Promise<CheckResult> {
  try {
    if (ctx.browser) {
      return await checkViaBrowserPage(product, ctx, ctx.browser);
    }
    if (ctx.skipBrowserLaunch) {
      return {
        status: "blocked",
        method: "browser",
        stores: [],
        error: "Best Buy storefront needs a browser session (deferred)",
        coversAllStoresInRange: false,
      };
    }
    if (!browserSupported()) {
      return {
        status: "blocked",
        method: "browser",
        stores: [],
        error: "Best Buy storefront is unreachable and browser fallback is unavailable",
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
  isConfigured: () => Boolean(apiKey()) || browserSupported(),
  configurationHint: BESTBUY_CONFIG_HINT,
  productUrl: (product) =>
    product.product_url ||
    `${BESTBUY_SITE}/site/searchpage.jsp?st=${encodeURIComponent(product.retailer_product_id)}`,
  async check(product, ctx) {
    const key = apiKey();
    if (key) {
      return checkViaApi(product, ctx, key);
    }
    if (!browserSupported() && !ctx.browser) {
      return {
        status: "skipped",
        method: "api",
        stores: [],
        error: "Best Buy not configured (missing BESTBUY_API_KEY) and browser fallback is unavailable",
        coversAllStoresInRange: false,
      };
    }
    return checkViaBrowser(product, ctx);
  },
};
