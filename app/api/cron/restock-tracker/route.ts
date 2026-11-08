import { NextRequest, NextResponse } from "next/server";
import { runAllHouseholdChecks } from "@restock/lib/runner";
import { isAuthorizedCronRequest } from "@restock/lib/scheduling";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Five-minute inventory check. Authenticated with CRON_SECRET, same as other Vercel crons. */
export async function GET(req: NextRequest) {
  if (
    !isAuthorizedCronRequest(
      req.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAllHouseholdChecks();
    return NextResponse.json({
      ok: true,
      households: result.households,
      ran: result.ran,
      skipped: result.skipped,
      results: result.summaries.map((s) => ({
        householdId: s.householdId,
        ran: s.ran,
        skippedReason: s.skippedReason,
        success: s.success,
        alertsSent: s.alertsSent,
        alertsFailed: s.alertsFailed,
        products: s.results.map((r) => ({
          retailer: r.retailer,
          status: r.status,
          method: r.method,
          storeCount: r.storeCount,
          availableCount: r.availableCount,
          error: r.error,
        })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restock check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
