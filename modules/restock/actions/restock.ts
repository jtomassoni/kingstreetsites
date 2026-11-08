"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/tools/auth/roles";
import { requireToolsUser } from "@/lib/tools/auth/session";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { loadDashboardData } from "@restock/lib/dashboard";
import {
  attemptDelivery,
  buildTestEmail,
  getNotificationStatus,
  parseRecipientList,
} from "@restock/lib/notify";
import { dashboardUrl, runHouseholdCheck, type RunSummary } from "@restock/lib/runner";
import {
  getSettings,
  insertAlert,
  setProductEnabled,
  updateSettings,
} from "@restock/lib/store";
import {
  RADIUS_OPTIONS,
  type RadiusMiles,
  type RestockDashboardData,
} from "@restock/types";

const PATH = "/tools/restock-tracker";

async function requireContext() {
  // Tools session (allowlist) + household membership, like the other tools.
  const toolsUser = await requireToolsUser();
  const { householdId, user } = await requireHouseholdContext();
  return { householdId, email: toolsUser.email, userId: user.id };
}

export async function getDashboardAction(): Promise<{
  data?: RestockDashboardData;
  error?: string;
}> {
  try {
    const { householdId, email } = await requireContext();
    return { data: await loadDashboardData(householdId, email) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load tracker" };
  }
}

export async function updateSettingsAction(input: {
  postalCode?: string;
  radiusMiles?: number;
  monitoringEnabled?: boolean;
  alertEmails?: string;
}): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireContext();
    const patch: Parameters<typeof updateSettings>[1] = {};

    if (input.postalCode !== undefined) {
      const zip = input.postalCode.trim();
      if (!/^\d{5}$/.test(zip)) return { error: "Enter a 5-digit US ZIP code." };
      patch.postal_code = zip;
    }
    if (input.radiusMiles !== undefined) {
      if (!(RADIUS_OPTIONS as readonly number[]).includes(input.radiusMiles)) {
        return { error: `Radius must be one of ${RADIUS_OPTIONS.join(", ")} miles.` };
      }
      patch.radius_miles = input.radiusMiles as RadiusMiles;
    }
    if (input.monitoringEnabled !== undefined) {
      patch.monitoring_enabled = input.monitoringEnabled;
    }
    if (input.alertEmails !== undefined) {
      const raw = input.alertEmails.trim();
      const parsed = parseRecipientList(raw);
      if (raw && parsed.length === 0) {
        return { error: "Enter valid email addresses separated by commas." };
      }
      patch.alert_emails = parsed;
    }

    const updated = await updateSettings(householdId, patch);
    if (!updated) return { error: "Settings not found." };
    revalidatePath(PATH);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save settings" };
  }
}

export async function setProductEnabledAction(input: {
  productId: string;
  enabled: boolean;
}): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireContext();
    const ok = await setProductEnabled(householdId, input.productId, input.enabled);
    if (!ok) return { error: "Product not found." };
    revalidatePath(PATH);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update product" };
  }
}

export async function checkNowAction(): Promise<{
  summary?: RunSummary;
  error?: string;
}> {
  try {
    const { householdId } = await requireContext();
    const summary = await runHouseholdCheck(householdId, { trigger: "manual" });
    revalidatePath(PATH);
    if (!summary.ran) return { summary, error: summary.skippedReason };
    return { summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Check failed" };
  }
}

/** Super admin only: send a test email to the configured recipients. */
export async function sendTestNotificationAction(): Promise<{
  ok?: boolean;
  recipients?: string[];
  error?: string;
}> {
  try {
    const { householdId, email } = await requireContext();
    if (!isSuperAdmin(email)) {
      return { error: "Only the super admin can send test notifications." };
    }
    const settings = await getSettings(householdId);
    if (!settings) return { error: "Settings not found." };
    const status = getNotificationStatus(settings.alert_emails);
    if (!status.configured) {
      return { error: `Notifications not configured: ${status.reason}` };
    }
    const test = buildTestEmail({ requestedBy: email, dashboardUrl: dashboardUrl() });
    const alert = await insertAlert({
      householdId,
      productId: null,
      eventId: null,
      storeId: null,
      kind: "test",
      recipients: status.recipients,
      subject: test.subject,
      body: test.text,
    });
    const outcome = await attemptDelivery(alert);
    revalidatePath(PATH);
    if (!outcome.ok) return { error: outcome.error ?? "Delivery failed" };
    return { ok: true, recipients: status.recipients };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not send test" };
  }
}
