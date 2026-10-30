/**
 * Meals uses the shared household-tools session cookie.
 * Re-exports keep existing @meals imports working.
 */
export {
  TOOLS_SESSION_COOKIE as SESSION_COOKIE,
  TOOLS_SESSION_MAX_AGE_SECONDS as SESSION_MAX_AGE_SECONDS,
  createToolsSessionToken as createSessionToken,
  readToolsSessionUser as readSessionUser,
  setToolsSessionCookie as setSessionCookie,
  clearToolsSessionCookie as clearSessionCookie,
  verifyToolsSessionToken as verifySessionToken,
  type ToolsSessionUser as SessionUser,
} from "@/lib/tools/auth/session-cookie";
