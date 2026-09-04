import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { ensureBillingSchema } from "@/lib/billing";
import { buildTaxYearCsv, getTaxYearSummary } from "@/lib/tax";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yearParam = Number(req.nextUrl.searchParams.get("year"));
  const year = Number.isFinite(yearParam) ? yearParam : new Date().getFullYear();
  const format = req.nextUrl.searchParams.get("format") ?? "csv";

  const pool = getDbPool();
  await ensureBillingSchema(pool);
  const summary = await getTaxYearSummary(pool, year);

  if (format === "json") {
    return NextResponse.json(summary);
  }

  const csv = buildTaxYearCsv(summary);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kingstreetsites-tax-${year}.csv"`,
    },
  });
}
