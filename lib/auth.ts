import crypto from "crypto";
import { cookies } from "next/headers";

import { getAdminUser } from "@/lib/env";

const COOKIE_NAME = "kss_admin_session";

function buildToken(): string {
  const { username, password } = getAdminUser();
  return crypto.createHash("sha256").update(`${username}:${password}`).digest("hex");
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token === buildToken();
}

export async function setAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, buildToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
