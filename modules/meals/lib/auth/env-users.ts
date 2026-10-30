export {
  parseAuthUsers,
  parseNamedLoginPairs,
  getToolsAuthUsers as getEnvAuthUsers,
  findToolsAuthUser as findEnvAuthUser,
  toolsAuthEmails as envAuthEmails,
  normalizeEmail,
  type ToolsAuthUser as EnvAuthUser,
} from "@/lib/tools/auth/env-users";

import { toolsAuthUsersRaw } from "@/lib/tools/auth/env-users";

/** Raw allowlist string for env schema (TOOLS_AUTH_USERS || AUTH_USERS). */
export function mealsAuthUsersRaw(): string {
  return toolsAuthUsersRaw() ?? "";
}
