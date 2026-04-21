import { NextResponse } from "next/server";

import { getAdminUser } from "@/lib/env";
import { setAdminSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const admin = getAdminUser();

    if (body.username !== admin.username || body.password !== admin.password) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    await setAdminSession();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Authentication failed." }, { status: 500 });
  }
}
