import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { BROWSER_BUDGET_MS } from "@restock/lib/scheduling";

/**
 * Headed Google Chrome session for retailers whose storefront JSON is
 * Cloudflare-protected (GameStop). Plain HTTP, Playwright-launched headless
 * Chrome, and Lambda Chromium all get 403. A real headed Chrome attached over
 * CDP loads the public product page like a shopper, then the page's own
 * session can call FindStores. No CAPTCHA solving, no proxies, no fingerprint
 * spoofing: if the retailer still challenges the session we report "blocked".
 *
 * Runtime:
 *  - Local Mac: dedicated headed Chrome (`~/.kss-restock-chrome`) over CDP.
 *  - Vercel / AWS Lambda: browser checks are skipped (datacenter IPs are
 *    blocked). Set RESTOCK_FORCE_BROWSER=1 only to debug Lambda Chromium.
 */

const DEFAULT_CDP_PORT = 9333;
const MAC_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV,
  );
}

function chromePath(): string | null {
  const custom = process.env.RESTOCK_BROWSER_EXECUTABLE?.trim();
  if (custom) return existsSync(custom) ? custom : null;
  if (process.platform === "darwin" && existsSync(MAC_CHROME)) return MAC_CHROME;
  return null;
}

function cdpPort(): number {
  const raw = Number(process.env.RESTOCK_CHROME_PORT);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_CDP_PORT;
}

function userDataDir(): string {
  const custom = process.env.RESTOCK_CHROME_USER_DATA_DIR?.trim();
  return custom || join(homedir(), ".kss-restock-chrome");
}

export function isServerlessEnvironment(): boolean {
  return isServerless();
}

export function browserAvailableLocally(): boolean {
  return chromePath() !== null;
}

/** True when this process can drive the household Mac Chrome that GameStop allows. */
export function browserUsesRealChrome(): boolean {
  if (process.env.RESTOCK_DISABLE_BROWSER === "1") return false;
  return !isServerless() && browserAvailableLocally();
}

export function browserSupported(): boolean {
  if (process.env.RESTOCK_DISABLE_BROWSER === "1") return false;
  if (browserUsesRealChrome()) return true;
  return isServerless() && process.env.RESTOCK_FORCE_BROWSER === "1";
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function cdpReady(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForCdp(port: number, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await cdpReady(port)) return;
    await sleep(200);
  }
  throw new Error(`Chrome CDP did not come up on port ${port} within ${timeoutMs}ms`);
}

function spawnHeadedChrome(port: number): void {
  const executable = chromePath();
  if (!executable) {
    throw new Error("Google Chrome is not installed (needed for GameStop checks)");
  }
  const dir = userDataDir();
  mkdirSync(dir, { recursive: true });
  const proc = spawn(
    executable,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  );
  proc.unref();
}

async function launchLambdaChromium(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const sparticuz = (await import("@sparticuz/chromium")).default;
  sparticuz.setGraphicsMode = false;
  const executablePath = await sparticuz.executablePath();
  return chromium.launch({
    args: sparticuz.args,
    executablePath,
    headless: true,
  });
}

async function connectHeadedChrome(): Promise<{ browser: Browser; owned: boolean }> {
  const { chromium } = await import("playwright-core");
  const port = cdpPort();
  if (await cdpReady(port)) {
    return {
      browser: await chromium.connectOverCDP(`http://127.0.0.1:${port}`),
      owned: false,
    };
  }
  spawnHeadedChrome(port);
  await waitForCdp(port, 20_000);
  return {
    browser: await chromium.connectOverCDP(`http://127.0.0.1:${port}`),
    owned: false,
  };
}

export type BrowserSession = {
  page: Page;
  context: BrowserContext;
  /** Milliseconds left in the session budget. */
  remainingMs: () => number;
};

/**
 * Run `fn` inside a browser context and always release the page.
 * Local checks attach to a long-lived headed Chrome so Cloudflare cookies
 * stay warm; we do not quit Chrome afterwards unless RESTOCK_CHROME_QUIT=1.
 */
export async function withBrowserSession<T>(
  fn: (session: BrowserSession) => Promise<T>,
  budgetMs: number = BROWSER_BUDGET_MS,
): Promise<T> {
  const startedAt = Date.now();
  const remainingMs = () => Math.max(0, budgetMs - (Date.now() - startedAt));

  let browser: Browser | null = null;
  let page: Page | null = null;
  let timer: NodeJS.Timeout | null = null;
  let quitOnExit = false;

  try {
    if (browserUsesRealChrome()) {
      const attached = await connectHeadedChrome();
      browser = attached.browser;
      quitOnExit = process.env.RESTOCK_CHROME_QUIT === "1";
    } else {
      browser = await launchLambdaChromium();
      quitOnExit = true;
    }

    const context =
      browser.contexts()[0] ??
      (await browser.newContext({
        locale: "en-US",
        timezoneId: "America/Denver",
        viewport: { width: 1280, height: 900 },
      }));
    page = await context.newPage();
    page.setDefaultTimeout(Math.min(30_000, Math.max(5_000, remainingMs())));

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
    if (page) await page.close().catch(() => undefined);
    if (browser && quitOnExit) {
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
 * Fetch a same-origin URL from inside the page (cookies and
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

export function looksLikeChallengeTitle(title: string): boolean {
  return /attention required|just a moment|access denied|please wait/i.test(
    title,
  );
}
