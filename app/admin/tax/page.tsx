import { dbPool } from "@/lib/db";
import { ensureBillingSchema } from "@/lib/billing";
import { availableTaxYears, getTaxYearSummary } from "@/lib/tax";
import { crm } from "@/lib/admin-ui";
import TaxWorkspace from "./tax-workspace";

export default async function TaxPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const years = availableTaxYears();
  const parsed = Number(yearParam);
  const year = Number.isFinite(parsed) && years.includes(parsed) ? parsed : years[0];

  await ensureBillingSchema(dbPool);
  const summary = await getTaxYearSummary(dbPool, year);

  return (
    <div className="w-full max-w-4xl">
      <header className="mb-6">
        <h1 className={crm.pageTitle}>Tax</h1>
        <p className={crm.pageLead}>
          Year-end income (including barter at FMV), deductible expenses, and a CSV export for Schedule
          C prep.
        </p>
      </header>
      <TaxWorkspace year={year} years={years} summary={summary} />
    </div>
  );
}
