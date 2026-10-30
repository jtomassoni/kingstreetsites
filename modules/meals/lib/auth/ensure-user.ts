import { query, queryOne } from "@meals/lib/db";
import { getEnv } from "@meals/lib/env";
import { normalizeEmail } from "@meals/lib/utils";

/**
 * Ensure profile + household membership for an env-auth login.
 */
export async function ensureEnvUserReady(email: string, _password = "") {
  const env = getEnv();
  const normalized = normalizeEmail(email);
  const display =
    normalized.split("@")[0]?.replace(/[._-]+/g, " ") || normalized;

  let profile = await queryOne<{ id: string; email: string | null }>`
    SELECT id, email FROM profiles WHERE lower(email) = ${normalized} LIMIT 1
  `;

  if (!profile) {
    profile = await queryOne<{ id: string; email: string | null }>`
      INSERT INTO profiles (email, display_name)
      VALUES (${normalized}, ${display})
      RETURNING id, email
    `;
  } else {
    await query`
      UPDATE profiles
      SET display_name = COALESCE(NULLIF(display_name, ''), ${display}),
          email = ${normalized}
      WHERE id = ${profile.id}
    `;
  }

  if (!profile) throw new Error("Failed to create profile");

  const householdName = env.DEFAULT_HOUSEHOLD_NAME;
  let household = await queryOne<{ id: string }>`
    SELECT id FROM households WHERE name = ${householdName} LIMIT 1
  `;

  if (!household) {
    household = await queryOne<{ id: string }>`
      INSERT INTO households (name) VALUES (${householdName})
      RETURNING id
    `;
  }
  if (!household) throw new Error("Failed to create household");

  await query`
    INSERT INTO household_members (household_id, user_id, role, is_active)
    VALUES (${household.id}, ${profile.id}, 'admin', true)
    ON CONFLICT (household_id, user_id)
    DO UPDATE SET role = 'admin', is_active = true
  `;

  await query`
    INSERT INTO user_preferences (user_id, household_id, email_enabled)
    VALUES (${profile.id}, ${household.id}, false)
    ON CONFLICT (user_id, household_id) DO NOTHING
  `;

  return { userId: profile.id, email: normalized, householdId: household.id };
}
