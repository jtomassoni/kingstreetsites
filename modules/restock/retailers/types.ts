import type { BrowserSession } from "@restock/lib/browser";
import type { CheckResult, RetailerId, TrackedProduct } from "@restock/types";

export type CheckContext = {
  postalCode: string;
  radiusMiles: number;
  /** Abort signal honoring the overall run budget. */
  signal?: AbortSignal;
  /** Shared Playwright session for the current household run. */
  browser?: BrowserSession;
  /**
   * When true, adapters that would launch their own browser must instead
   * return blocked so the runner can open one shared session.
   */
  skipBrowserLaunch?: boolean;
};

export type RetailerAdapter = {
  id: RetailerId;
  label: string;
  /** Config present (keys etc.). Adapters without config return status "skipped". */
  isConfigured: () => boolean;
  /** Static note shown in the dashboard when the provider is not configured. */
  configurationHint: string;
  productUrl: (product: TrackedProduct) => string;
  check: (product: TrackedProduct, ctx: CheckContext) => Promise<CheckResult>;
};

export type HttpResponseLike = {
  status: number;
  contentType: string | null;
  body: string;
};

/** fetch with a hard timeout; never throws on HTTP errors, only on network failure. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs: number },
): Promise<HttpResponseLike> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  const onOuterAbort = () => controller.abort();
  init.signal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      redirect: "manual",
    });
    const body = await res.text();
    return {
      status: res.status,
      contentType: res.headers.get("content-type"),
      body,
    };
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onOuterAbort);
  }
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return "Request timed out";
    return err.message || fallback;
  }
  return fallback;
}
