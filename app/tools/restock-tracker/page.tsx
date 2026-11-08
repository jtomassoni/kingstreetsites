import { redirect } from "next/navigation";
import { ToolsChrome } from "@/components/tools/tools-chrome";
import { AuthError, requireHouseholdContext } from "@meals/lib/auth/session";
import { RestockApp } from "@restock/components/restock-app";
import { loadDashboardData } from "@restock/lib/dashboard";
import { requireToolsUser } from "@/lib/tools/auth/session";

export const metadata = {
  title: "Restock Tracker — Tools",
  robots: { index: false, follow: false },
};

export const maxDuration = 300;

export default async function RestockTrackerPage() {
  await requireToolsUser();

  let householdId: string;
  let email: string;
  try {
    const ctx = await requireHouseholdContext();
    householdId = ctx.householdId;
    email = ctx.user.email;
  } catch (e) {
    if (e instanceof AuthError && e.code === "unauthenticated") {
      redirect("/tools/login?next=/tools/restock-tracker");
    }
    throw e;
  }

  const data = await loadDashboardData(householdId, email);

  return (
    <ToolsChrome email={email} activeHref="/tools/restock-tracker">
      <RestockApp initial={data} />
    </ToolsChrome>
  );
}
