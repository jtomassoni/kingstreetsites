import Link from "next/link";
import { dbPool } from "@/lib/db";
import { ensureBillingSchema, formatMoney, INVOICE_STATUS_LABEL, type InvoiceStatus } from "@/lib/billing";
import { crm, invoiceStatusTone } from "@/lib/admin-ui";
import InvoiceTemplatesPanel from "./invoice-templates-panel";

async function getInvoices(status?: string) {
  const values: string[] = [];
  let where = "";
  if (status) {
    values.push(status);
    where = "where i.status = $1";
  }

  const { rows } = await dbPool.query(
    `select
       i.*,
       l.business_name,
       coalesce((select sum(p.amount_cents) from invoice_payments p where p.invoice_id = i.id), 0)::int as paid_cents
     from invoices i
     join leads l on l.id = i.lead_id
     ${where}
     order by i.created_at desc
     limit 300`,
    values
  );
  return rows;
}

async function getBillingTotals() {
  const { rows } = await dbPool.query<{
    outstanding_cents: number;
    collected_cents: number;
    open_count: number;
  }>(
    `select
       coalesce(sum(case when i.status not in ('paid','void') then greatest(i.amount_cents - coalesce(p.paid, 0), 0) else 0 end), 0)::int as outstanding_cents,
       coalesce(sum(coalesce(p.paid, case when i.status = 'paid' then i.amount_cents else 0 end)) filter (where i.status <> 'void'), 0)::int as collected_cents,
       count(*) filter (where i.status not in ('paid','void'))::int as open_count
     from invoices i
     left join lateral (
       select coalesce(sum(amount_cents), 0)::int as paid
       from invoice_payments where invoice_id = i.id
     ) p on true`
  );
  return rows[0] ?? { outstanding_cents: 0, collected_cents: 0, open_count: 0 };
}

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  await ensureBillingSchema(dbPool);
  const [invoices, totals] = await Promise.all([getInvoices(status), getBillingTotals()]);

  return (
    <div className="w-full">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={crm.pageTitle}>Billing</h1>
          <p className={crm.pageLead}>
            Invoices and payments across customers and leads. Create and collect from each record&apos;s billing tab.
          </p>
        </div>
        <div className={`${crm.statGrid} mb-0 w-full sm:w-auto sm:grid-cols-3`}>
          <div className={crm.statTile}>
            <p className={crm.statLabel}>Open</p>
            <p className={crm.statValue}>{totals.open_count}</p>
          </div>
          <div className={crm.statTile}>
            <p className={crm.statLabel}>Outstanding</p>
            <p className={crm.statValue}>{formatMoney(totals.outstanding_cents)}</p>
          </div>
          <div className={crm.statTile}>
            <p className={crm.statLabel}>Collected</p>
            <p className={crm.statValue}>{formatMoney(totals.collected_cents)}</p>
          </div>
        </div>
      </header>

      <InvoiceTemplatesPanel />

      <h2 className={`${crm.sectionTitle} mb-3`}>All invoices</h2>

      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.key || "all"}
            href={f.key ? `/admin/billing?status=${f.key}` : "/admin/billing"}
            className={crm.pill((status ?? "") === f.key)}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-crm-border p-12 text-center">
          <p className="text-base font-medium text-crm-text">No invoices yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-crm-muted">
            Create invoices from a{" "}
            <Link href="/admin/leads?view=customers" className={crm.link}>
              customer
            </Link>{" "}
            or any lead detail page.
          </p>
        </div>
      ) : (
        <div className={crm.list}>
          {invoices.map((inv: {
            id: string;
            lead_id: string;
            invoice_number: string;
            title: string;
            business_name: string;
            amount_cents: number;
            paid_cents: number;
            status: InvoiceStatus;
            due_date: string | null;
            currency: string;
          }) => (
            <Link
              key={inv.id}
              href={`/admin/leads/${inv.lead_id}/billing`}
              className={`${crm.listRow} hover:no-underline`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-crm-faint">{inv.invoice_number}</p>
                <p className="font-medium text-crm-text">{inv.title}</p>
                <p className="mt-0.5 text-sm text-crm-muted">{inv.business_name}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                <div className="text-right">
                  <p className="tabular-nums text-sm font-medium text-crm-text">
                    {formatMoney(inv.amount_cents, inv.currency)}
                  </p>
                  {inv.paid_cents > 0 && inv.paid_cents < inv.amount_cents ? (
                    <p className="text-xs text-crm-faint">{formatMoney(inv.paid_cents)} paid</p>
                  ) : null}
                </div>
                <span className={crm.badge(invoiceStatusTone(inv.status))}>
                  {INVOICE_STATUS_LABEL[inv.status]}
                </span>
                <span className="text-xs text-crm-faint">
                  {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
