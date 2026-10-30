import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/** Shared across Meal Planner, Movie List, and Arcade — not the CRM next-auth session. */
export const TOOLS_SESSION_COOKIE = "kss_tools_session";

/** Sessions expire after 30 days; membership is re-checked on every request. */
export const TOOLS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type ToolsSessionUser = {
  id: string;
  email: string;
};

function secretKey() {
  const secret =
    process.env.TOOLS_SESSION_SECRET || process.env.SESSION_SECRET || "";
  if (!secret || secret.length < 16) {
    throw new Error(
      "TOOLS_SESSION_SECRET (or SESSION_SECRET) must be set (16+ chars)",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createToolsSessionToken(
  user: ToolsSessionUser,
): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${TOOLS_SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function readToolsSessionUser(): Promise<ToolsSessionUser | null> {
  const jar = await cookies();
  const token = jar.get(TOOLS_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToolsSessionToken(token);
}

export async function setToolsSessionCookie(user: ToolsSessionUser) {
  const token = await createToolsSessionToken(user);
  const jar = await cookies();
  jar.set(TOOLS_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOOLS_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearToolsSessionCookie() {
  const jar = await cookies();
  jar.delete(TOOLS_SESSION_COOKIE);
}

export async function verifyToolsSessionToken(
  token: string | undefined,
): Promise<ToolsSessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const id = typeof payload.sub === "string" ? payload.sub : null;
    const email =
      typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    if (!id || !email) return null;
    return { id, email };
  } catch {
    return null;
  }
}
