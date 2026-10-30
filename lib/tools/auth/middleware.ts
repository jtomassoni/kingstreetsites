import { NextResponse, type NextRequest } from "next/server";
import {
  isToolsAuthConfigured,
  toolsAuthEmails,
} from "@/lib/tools/auth/env-users";
import {
  TOOLS_SESSION_COOKIE,
  verifyToolsSessionToken,
} from "@/lib/tools/auth/session-cookie";

/** Server Actions POST with this header; redirects must use x-action-redirect. */
export function isServerActionRequest(request: NextRequest): boolean {
  return request.headers.has("next-action");
}

function redirectServerAction(url: URL) {
  const target = `${url.pathname}${url.search}`;
  return new NextResponse(null, {
    status: 303,
    headers: {
      "x-action-redirect": target,
    },
  });
}

function requestBase(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (request.nextUrl.protocol.replace(":", "") || "http");
  return `${proto}://${host}`;
}

function toolsUrl(request: NextRequest, path: string): URL {
  return new URL(path, requestBase(request));
}

function redirectOrActionRedirect(request: NextRequest, url: URL) {
  if (isServerActionRequest(request)) {
    return redirectServerAction(url);
  }
  return NextResponse.redirect(url);
}

/**
 * Protect /tools/* (except login) and /api/tools/*.
 * Does not touch /admin — business CRM stays on next-auth.
 */
export async function updateToolsSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isLogin = path === "/tools/login" || path.startsWith("/tools/login/");
  const isToolsApi = path.startsWith("/api/tools/");
  const isToolsPage = path === "/tools" || path.startsWith("/tools/");

  if (!isToolsPage && !isToolsApi) {
    return null;
  }

  if (!isToolsAuthConfigured()) {
    if (isLogin) return NextResponse.next();
    if (isToolsApi) {
      return NextResponse.json(
        { error: "Tools authentication is not configured." },
        { status: 503 },
      );
    }
    return redirectOrActionRedirect(
      request,
      toolsUrl(request, "/tools/login?error=config"),
    );
  }

  const token = request.cookies.get(TOOLS_SESSION_COOKIE)?.value;
  const user = await verifyToolsSessionToken(token);
  const allowed = toolsAuthEmails();

  if (user && allowed.length && !allowed.includes(user.email)) {
    const res = redirectOrActionRedirect(
      request,
      toolsUrl(request, "/tools/login?error=unauthorized"),
    );
    res.cookies.delete(TOOLS_SESSION_COOKIE);
    return res;
  }

  if (!user && !isLogin) {
    if (isToolsApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const next = encodeURIComponent(path);
    return redirectOrActionRedirect(
      request,
      toolsUrl(request, `/tools/login?next=${next}`),
    );
  }

  if (user && isLogin) {
    return redirectOrActionRedirect(request, toolsUrl(request, "/tools"));
  }

  return NextResponse.next();
}
