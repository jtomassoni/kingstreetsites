"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { query, queryOne } from "@meals/lib/db";
import { normalizeEmail } from "@meals/lib/utils";

export async function updateHouseholdName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Household name is required." };

  const { householdId } = await requireHouseholdContext();
  try {
    await query`
      UPDATE households SET name = ${trimmed} WHERE id = ${householdId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
  revalidatePath("/tools/meals/settings");
  revalidatePath("/tools/meals", "layout");
  return { success: true };
}

export async function updateHouseholdMember(input: {
  userId: string;
  displayName: string;
}) {
  const { householdId } = await requireHouseholdContext();
  const displayName = input.displayName.trim();
  if (!displayName) return { error: "Display name is required." };

  const membership = await queryOne<{ user_id: string }>`
    SELECT user_id FROM household_members
    WHERE household_id = ${householdId}
      AND user_id = ${input.userId}
      AND is_active = true
    LIMIT 1
  `;
  if (!membership) return { error: "Member not found." };

  try {
    await query`
      UPDATE profiles SET display_name = ${displayName} WHERE id = ${input.userId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }

  revalidatePath("/tools/meals/settings");
  revalidatePath("/tools/meals/week");
  revalidatePath("/tools/meals", "layout");
  return { success: true };
}

export async function removeHouseholdMember(userId: string) {
  const { user, householdId } = await requireHouseholdContext();
  if (userId === user.id) {
    return { error: "You can’t remove yourself from the household." };
  }

  const membership = await queryOne<{ user_id: string }>`
    SELECT user_id FROM household_members
    WHERE household_id = ${householdId}
      AND user_id = ${userId}
      AND is_active = true
    LIMIT 1
  `;
  if (!membership) return { error: "Member not found." };

  try {
    await query`
      UPDATE household_members
      SET is_active = false
      WHERE household_id = ${householdId} AND user_id = ${userId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Remove failed" };
  }

  revalidatePath("/tools/meals/settings");
  revalidatePath("/tools/meals/week");
  revalidatePath("/tools/meals", "layout");
  return { success: true };
}

export async function addHouseholdMember(input: {
  email: string;
  displayName: string;
  password: string;
}) {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim() || email.split("@")[0] || "Member";

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email." };
  }

  const { householdId } = await requireHouseholdContext();

  let profile = await queryOne<{ id: string }>`
    SELECT id FROM profiles WHERE lower(email) = ${email} LIMIT 1
  `;
  const existed = Boolean(profile);

  if (!profile) {
    profile = await queryOne<{ id: string }>`
      INSERT INTO profiles (email, display_name)
      VALUES (${email}, ${displayName})
      RETURNING id
    `;
  } else {
    await query`
      UPDATE profiles SET display_name = ${displayName}, email = ${email}
      WHERE id = ${profile.id}
    `;
  }

  if (!profile) return { error: "Failed to create profile." };

  try {
    await query`
      INSERT INTO household_members (household_id, user_id, role, is_active)
      VALUES (${householdId}, ${profile.id}, 'admin', true)
      ON CONFLICT (household_id, user_id)
      DO UPDATE SET role = 'admin', is_active = true
    `;

    await query`
      INSERT INTO user_preferences (user_id, household_id, email_enabled)
      VALUES (${profile.id}, ${householdId}, false)
      ON CONFLICT (user_id, household_id) DO NOTHING
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add member." };
  }

  revalidatePath("/tools/meals/settings");
  revalidatePath("/tools/meals/week");
  revalidatePath("/tools/meals", "layout");
  return {
    success: true,
    userId: profile.id,
    createdAuthUser: !existed,
    message: existed
      ? `${displayName} was linked to this household. Add them to AUTH_USERS (email:password) so they can sign in.`
      : `${displayName} was added. Add ${email}:<password> to AUTH_USERS so they can sign in.`,
  };
}
