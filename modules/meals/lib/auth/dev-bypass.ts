/**
 * Dev auth bypass helpers. Never enable in production.
 */

export type DevBypassEnv = {
  nodeEnv?: string;
  vercelEnv?: string;
  appUrl?: string;
  flag?: string;
};

function isLocalAppUrl(appUrl: string | undefined): boolean {
  if (!appUrl) return false;
  try {
    const host = new URL(appUrl).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export function isDevAuthBypassEnabled(env: DevBypassEnv = {}): boolean {
  const nodeEnv = env.nodeEnv ?? process.env.NODE_ENV;
  const vercelEnv = env.vercelEnv ?? process.env.VERCEL_ENV;
  const appUrl = env.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const flag = env.flag ?? process.env.ENABLE_DEV_AUTH_BYPASS;

  if (nodeEnv === "production") return false;
  if (vercelEnv === "production") return false;
  if (flag !== "true" && flag !== "1") return false;
  if (!isLocalAppUrl(appUrl)) return false;

  return true;
}

export function getDevLoginCredentials(): {
  email: string;
  password: string;
} | null {
  if (!isDevAuthBypassEnabled()) return null;
  const email = (process.env.DEV_LOGIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.DEV_LOGIN_PASSWORD ?? "";
  if (!email || !password) return null;
  return { email, password };
}
