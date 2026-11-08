import { isSuperAdmin } from "@/lib/tools/auth/roles";
import { getNotificationStatus } from "@restock/lib/notify";
import { defaultAlertEmails } from "@restock/lib/runner";
import {
  ensureSettings,
  latestChecksByProduct,
  listProducts,
  listRecentAlerts,
  listRecentChecks,
  listRecentEvents,
  listStoreStates,
} from "@restock/lib/store";
import { ADAPTERS } from "@restock/retailers/index";
import { browserSupported } from "@restock/lib/browser";
import {
  RETAILERS,
  type ProviderStatus,
  type RestockDashboardData,
  type TrackedProduct,
} from "@restock/types";

function providerStatuses(
  products: TrackedProduct[],
  lastOk: RestockDashboardData["lastOkCheckByProduct"],
  last: RestockDashboardData["lastCheckByProduct"],
): ProviderStatus[] {
  return RETAILERS.map((retailer) => {
    const adapter = ADAPTERS[retailer];
    const configured = adapter.isConfigured();
    const retailerProducts = products.filter((p) => p.retailer === retailer);
    const verified = retailerProducts.some((p) => Boolean(lastOk[p.id]));
    const latest = retailerProducts.map((p) => last[p.id]).find(Boolean);

    let note: string | null = null;
    if (!configured) {
      note = adapter.configurationHint;
    } else if (!verified) {
      note = latest?.error
        ? `Unverified — last attempt: ${latest.error}`
        : "Unverified — no successful check recorded yet";
    } else if (latest && latest.status !== "ok") {
      note = `Last attempt failed (${latest.status}): ${latest.error ?? "no details"}`;
    }
    if (retailer === "gamestop" && configured && !browserSupported()) {
      note = [note, "Browser fallback unavailable in this environment."]
        .filter(Boolean)
        .join(" ");
    }
    return { retailer, label: adapter.label, configured, verified, note };
  });
}

export async function loadDashboardData(
  householdId: string,
  userEmail: string,
): Promise<RestockDashboardData> {
  const settings = await ensureSettings(householdId, {
    alertEmails: defaultAlertEmails(),
  });
  const [products, stores, recentChecks, recentEvents, recentAlerts, latest] =
    await Promise.all([
      listProducts(householdId),
      listStoreStates(householdId),
      listRecentChecks(householdId, 30),
      listRecentEvents(householdId, 25),
      listRecentAlerts(householdId, 20),
      latestChecksByProduct(householdId),
    ]);

  return {
    settings,
    products,
    stores,
    recentChecks,
    recentEvents,
    recentAlerts,
    providers: providerStatuses(products, latest.lastOk, latest.last),
    notifications: getNotificationStatus(settings.alert_emails),
    lastCheckByProduct: latest.last,
    lastOkCheckByProduct: latest.lastOk,
    isSuperAdmin: isSuperAdmin(userEmail),
    cronConfigured: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16),
  };
}
