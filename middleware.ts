import { NextResponse, type NextRequest } from "next/server";
import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { updateToolsSession } from "@/lib/tools/auth/middleware";

const { auth } = NextAuth(authConfig);

export default auth(async (request) => {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/tools") || path.startsWith("/api/tools")) {
    const toolsResponse = await updateToolsSession(
      request as unknown as NextRequest,
    );
    if (toolsResponse) return toolsResponse;
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/tools", "/tools/:path*", "/api/tools/:path*"],
};
