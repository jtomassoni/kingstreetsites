"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isEasyLoginEnabled } from "@meals/lib/auth/easy-login";
import { ensureEnvUserReady } from "@meals/lib/auth/ensure-user";
import { normalizeEmail } from "@/lib/tools/auth/env-users";
import {
  findSignInUser,
  getSignInUsers,
  isToolsAuthConfigured,
} from "@/lib/tools/auth/roles";
import {
  mealsDatabaseUrl,
  stableToolsUserId,
} from "@/lib/tools/auth/provision";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  loginRateLimitKey,
  recordLoginFailure,
} from "@/lib/tools/auth/rate-limit";
import { safeToolsReturnPath } from "@/lib/tools/auth/safe-return";
import {
  clearToolsSessionCookie,
  setToolsSessionCookie,
} from "@/lib/tools/auth/session-cookie";

function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

export type ToolsAuthActionResult = {
  error?: string;
  success?: boolean;
};

async function clientKey(email: string): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local";
  return loginRateLimitKey(ip, email);
}

async function resolveUserId(email: string, password: string): Promise<string> {
  if (mealsDatabaseUrl()) {
    const ready = await ensureEnvUserReady(email, password);
    return ready.userId;
  }
  return stableToolsUserId(email);
}

async function completeLogin(
  email: string,
  password: string,
  nextPath: string,
): Promise<never> {
  const userId = await resolveUserId(email, password);
  await setToolsSessionCookie({ id: userId, email });
  redirect(safeToolsReturnPath(nextPath));
}

export async function toolsLoginAction(
  _prev: ToolsAuthActionResult,
  formData: FormData,
): Promise<ToolsAuthActionResult> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "/tools");

  if (!isToolsAuthConfigured()) {
    return {
      error:
        "Login is not configured. Set SUPER_ADMIN_USERS, APP_USERS, and TOOLS_SESSION_SECRET.",
    };
  }

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const key = await clientKey(email);
  const limit = checkLoginRateLimit(key);
  if (!limit.ok) {
    return {
      error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  const envUser = findSignInUser(email, password);
  if (!envUser) {
    recordLoginFailure(key);
    return { error: "Invalid email or password." };
  }

  try {
    clearLoginFailures(key);
    return await completeLogin(envUser.email, envUser.password, nextPath);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return {
      error: e instanceof Error ? e.message : "Login failed.",
    };
  }
}

/** One-click login for configured users — local development only. */
export async function toolsEasyLoginAction(
  _prev: ToolsAuthActionResult,
  formData: FormData,
): Promise<ToolsAuthActionResult> {
  if (!isEasyLoginEnabled()) {
    return { error: "Sign in with your email and password." };
  }
  if (!isToolsAuthConfigured()) {
    return {
      error:
        "Login is not configured. Set SUPER_ADMIN_USERS, APP_USERS, and TOOLS_SESSION_SECRET.",
    };
  }

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const nextPath = String(formData.get("next") ?? "/tools");
  if (!email) return { error: "Missing user." };

  const user = getSignInUsers().find((u) => u.email === email);
  if (!user) return { error: "Unknown user." };

  try {
    return await completeLogin(user.email, user.password, nextPath);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return {
      error: e instanceof Error ? e.message : "Login failed.",
    };
  }
}

export async function toolsLogoutAction() {
  await clearToolsSessionCookie();
  redirect("/tools/login");
}
