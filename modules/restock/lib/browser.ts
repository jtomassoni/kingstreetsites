import { existsSync } from "node:fs";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { BROWSER_BUDGET_MS } from "@restock/lib/scheduling";

/**
 * Headless browser session for retailers whose storefront JSON endpoints
 * refuse plain HTTP clients (GameStop's Cloudflare WAF 403s curl/undici but
 * serves a normal browser). We load the public product page like a shopper,
 * then call the same JSON endpoint the page itself calls. No CAPTCHA solving,
 * no proxies, no fingerprint spoofing: if the retailer challenges or blocks
 * the session we report "blocked".
 *
 * Runtime:
 *  - Vercel / AWS Lambda: @sparticuz/chromium (Chromium built for Lambda).
 *  - Local: installed Google Chrome (`channel: "chrome"`) or
 *    RESTOCK_BROWSER_EXECUTABLE.
 */

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV,
  );
}

const MAC_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export function browserAvailableLocally(): boolean {
  const custom = process.env.RESTOCK_BROWSER_EXECUTABLE?.trim();
  if (custom) return existsSync(custom);
  if (process.platform === "darwin") return existsSync(MAC_CHROME);
  return false;
}

export function browserSupported(): boolean {
  if (process.env.RESTOCK_DISABLE_BROWSER === "1") return false;
  return isServerless() || browserAvailableLocally();
}

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");

  if (isServerless()) {
    const sparticuz = (await import("@sparticuz/chromium")).default;
    // WebGL is not needed; skipping swiftshader shrinks cold start.
    sparticuz.setGraphicsMode = false;
    const executablePath = await sparticuz.executablePath();
    return chromium.launch({
      args: [...sparticuz.args, "--disable-http2"],
      executablePath,
      headless: true,
    });
  }

  const extraArgs = ["--disable-http2"];
  const custom = process.env.RESTOCK_BROWSER_EXECUTABLE?.trim();
  if (custom) {
    return chromium.launch({ executablePath: custom, headless: true, args: extraArgs });
  }
  if (process.platform === "darwin" && existsSync(MAC_CHROME)) {
    return chromium.launch({
      executablePath: MAC_CHROME,
      headless: true,
      args: extraArgs,
    });
  }
  return chromium.launch({ channel: "chrome", headless: true, args: extraArgs });
}

export type BrowserSession = {
  page: Page;
  context: BrowserContext;
  /** Milliseconds left in the session budget. */
  remainingMs: () => number;
};

/**
 * Run `fn` inside a fresh browser context and always tear the browser down.
 * The whole session (launch + work) must finish within BROWSER_BUDGET_MS.
 */
export async function withBrowserSession<T>(
  fn: (session: BrowserSession) => Promise<T>,
  budgetMs: number = BROWSER_BUDGET_MS,
): Promise<T> {
  const startedAt = Date.now();
  const remainingMs = () => Math.max(0, budgetMs - (Date.now() - startedAt));

  let browser: Browser | null = null;
  let timer: NodeJS.Timeout | null = null;
  try {
    browser = await launch();
    const context = await browser.newContext({
      userAgent: DESKTOP_UA,
      locale: "en-US",
      timezoneId: "America/Denver",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(Math.min(20_000, remainingMs()));

    const work = fn({ page, context, remainingMs });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Browser session exceeded ${budgetMs}ms budget`)),
        remainingMs(),
      );
    });
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

export type InPageFetchResult = {
  status: number;
  contentType: string | null;
  body: string;
};

/**
 * Fetch a same-origin URL from inside the page (cookies, CSRF, and
 * X-Requested-With exactly as the storefront's own JS would send them).
 */
export async function fetchJsonInPage(
  page: Page,
  url: string,
  headers: Record<string, string>,
): Promise<InPageFetchResult> {
  return page.evaluate(
    async ({ url, headers }) => {
      const res = await fetch(url, { headers, credentials: "include" });
      const body = await res.text();
      return {
        status: res.status,
        contentType: res.headers.get("content-type"),
        body,
      };
    },
    { url, headers },
  );
}
