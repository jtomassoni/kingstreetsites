import { NextResponse, type NextRequest } from "next/server";
import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { updateToolsSession } from "@/lib/tools/auth/middleware";
import { isSuperAdmin, signInEmails } from "@/lib/tools/auth/roles";
import {
  TOOLS_SESSION_COOKIE,
  verifyToolsSessionToken,
} from "@/lib/tools/auth/session-cookie";

const { auth } = NextAuth(authConfig);

function requestBase(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ||
    request.nextUrl.protocol.replace(":", "") ||
    "http";
  return `${proto}://${host}`;
}

export default auth(async (request) => {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/tools") || path.startsWith("/api/tools")) {
    const toolsResponse = await updateToolsSession(
      request as unknown as NextRequest,
    );
    if (toolsResponse) return toolsResponse;
    return NextResponse.next();
  }

  if (path.startsWith("/admin")) {
    const token = request.cookies.get(TOOLS_SESSION_COOKIE)?.value;
    const toolsUser = await verifyToolsSessionToken(token);
    if (toolsUser && signInEmails().includes(toolsUser.email)) {
      if (isSuperAdmin(toolsUser.email)) {
        return NextResponse.next();
      }
      // App user (e.g. Mary) — no CRM
      return NextResponse.redirect(
        new URL("/tools", requestBase(request as unknown as NextRequest)),
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/tools", "/tools/:path*", "/api/tools/:path*"],
};
