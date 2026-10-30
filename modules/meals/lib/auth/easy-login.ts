/**
 * One-click household account picker — allowed in local dev only.
 * Production and all deployed environments require email + password.
 */

export type EasyLoginEnv = {
  nodeEnv?: string;
  vercelEnv?: string;
};

export function isEasyLoginEnabled(env: EasyLoginEnv = {}): boolean {
  const nodeEnv = env.nodeEnv ?? process.env.NODE_ENV;
  const vercelEnv = env.vercelEnv ?? process.env.VERCEL_ENV;

  if (vercelEnv) return false;
  if (nodeEnv === "production") return false;

  return true;
}
