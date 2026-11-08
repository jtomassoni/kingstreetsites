import {
  browserSupported,
  fetchJsonInPage,
  withBrowserSession,
  type BrowserSession,
} from "@restock/lib/browser";
import { REQUEST_TIMEOUT_MS } from "@restock/lib/scheduling";
import {
  GAMESTOP_FIND_STORES_PATH,
  GAMESTOP_SITE,
  gamestopFindStoresUrl,
  gamestopProductUrl,
  looksLikeCloudflareBlock,
  parseGameStopResponse,
} from "@restock/retailers/gamestop/parse";
import {
  errorMessage,
  fetchWithTimeout,
  type CheckContext,
  type RetailerAdapter,
} from "@restock/retailers/types";
import type { CheckResult, TrackedProduct } from "@restock/types";

const JSON_HEADERS = {
  Accept: "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
};

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function productSlug(product: TrackedProduct): string | undefined {
  // Keep the canonical PDP URL the user tracked so "Open product" is exact.
  const match = product.product_url.match(/\/products\/([^/]+)\/\d+\.html/);
  return match?.[1];
}

async function checkDirect(
  product: TrackedProduct,
  ctx: CheckContext,
): Promise<CheckResult> {
  const url = gamestopFindStoresUrl({
    productId: product.retailer_product_id,
    postalCode: ctx.postalCode,
    radius: ctx.radiusMiles,
  });
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        ...JSON_HEADERS,
        "User-Agent": DESKTOP_UA,
        Referer: product.product_url,
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeoutMs: REQUEST_TIMEOUT_MS,
      signal: ctx.signal,
    });
    return parseGameStopResponse(
      { ...res, endpoint: "find" },
      "direct",
    );
  } catch (err) {
    return {
      status: "error",
      method: "direct",
      stores: [],
      error: errorMessage(err, "GameStop request failed"),
      coversAllStoresInRange: true,
    };
  }
}

async function checkViaBrowserPage(
  product: TrackedProduct,
  ctx: CheckContext,
  session: BrowserSession,
): Promise<CheckResult> {
  const { page } = session;
  const response = await page.goto(product.product_url, {
    waitUntil: "domcontentloaded",
  });
  const pageStatus = response?.status() ?? 0;
  const pageHtml = await page.content().catch(() => "");
  if (pageStatus === 403 || pageStatus === 429 || looksLikeCloudflareBlock(pageHtml)) {
    return {
      status: "blocked",
      method: "browser",
      stores: [],
      error: `GameStop blocked the browser session on the product page (HTTP ${pageStatus || "?"})`,
      coversAllStoresInRange: true,
    };
  }

  const params = new URLSearchParams({
    postalCode: ctx.postalCode,
    radius: String(ctx.radiusMiles),
    products: `${product.retailer_product_id}:1`,
  });
  const res = await fetchJsonInPage(
    page,
    `${GAMESTOP_SITE}${GAMESTOP_FIND_STORES_PATH}?${params.toString()}`,
    JSON_HEADERS,
  );
  return parseGameStopResponse({ ...res, endpoint: "find" }, "browser");
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
        error: "GameStop needs a browser session (deferred)",
        coversAllStoresInRange: true,
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
      error: `Browser check failed: ${errorMessage(err, "unknown error")}`,
      coversAllStoresInRange: true,
    };
  }
}

export const gamestopAdapter: RetailerAdapter = {
  id: "gamestop",
  label: "GameStop",
  isConfigured: () => true,
  configurationHint: "",
  productUrl: (product) =>
    product.product_url ||
    gamestopProductUrl(product.retailer_product_id, productSlug(product)),
  async check(product, ctx) {
    const direct = await checkDirect(product, ctx);
    if (direct.status !== "blocked") return direct;
    if (ctx.browser) {
      const viaBrowser = await checkViaBrowser(product, ctx);
      if (viaBrowser.status === "ok") return viaBrowser;
      return {
        ...viaBrowser,
        error: `${viaBrowser.error ?? "Browser check failed"} (direct request: ${direct.error})`,
      };
    }
    if (!browserSupported()) {
      return {
        ...direct,
        error: `${direct.error}. Browser fallback unavailable in this environment.`,
      };
    }
    if (ctx.skipBrowserLaunch) {
      return {
        status: "blocked",
        method: "browser",
        stores: [],
        error: "GameStop needs a browser session (deferred)",
        coversAllStoresInRange: true,
      };
    }
    const viaBrowser = await checkViaBrowser(product, ctx);
    if (viaBrowser.status === "ok") return viaBrowser;
    return {
      ...viaBrowser,
      error: `${viaBrowser.error ?? "Browser check failed"} (direct request: ${direct.error})`,
    };
  },
};
