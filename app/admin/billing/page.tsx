import Link from "next/link";
import { dbPool } from "@/lib/db";
import { ensureBillingSchema, formatMoney, INVOICE_STATUS_LABEL, type InvoiceStatus } from "@/lib/billing";

async function getInvoices(status?: string) {
  await ensureBillingSchema(dbPool);
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
  await ensureBillingSchema(dbPool);
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

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-700/80 text-slate-200",
  sent: "bg-sky-500/15 text-sky-200",
  paid: "bg-emerald-500/15 text-emerald-200",
  void: "bg-slate-800 text-slate-500",
  overdue: "bg-red-500/15 text-red-200",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const [invoices, totals] = await Promise.all([getInvoices(status), getBillingTotals()]);

  return (
    <div className="relative w-full">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            CRM
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Billing</h1>
          <p className="mt-1.5 max-w-lg text-sm text-slate-400">
            Invoices and payments for customers (and any lead). Create and collect from the customer or lead record.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Open</p>
            <p className="text-lg font-semibold text-white">{totals.open_count}</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-amber-500/80">Outstanding</p>
            <p className="text-lg font-semibold text-amber-100">{formatMoney(totals.outstanding_cents)}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-emerald-500/80">Collected</p>
            <p className="text-lg font-semibold text-emerald-100">{formatMoney(totals.collected_cents)}</p>
          </div>
        </div>
      </header>

      <div className="mb-6 inline-flex flex-wrap gap-1 rounded-full border border-white/10 bg-slate-950/80 p-1">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.key || "all"}
            href={f.key ? `/admin/billing?status=${f.key}` : "/admin/billing"}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              (status ?? "") === f.key
                ? "bg-teal-500/20 text-teal-100 ring-1 ring-teal-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/40 p-12 text-center">
          <p className="text-base font-medium text-slate-200">No invoices yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            Create invoices from a{" "}
            <Link href="/admin/leads?view=customers" className="text-teal-400 hover:underline">
              customer
            </Link>{" "}
            or any lead detail page.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-slate-900/50 to-slate-950/70 shadow-2xl ring-1 ring-teal-500/10">
          <table className="w-full text-sm">
            <thead className="border-b border-white/[0.08] bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Invoice
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Due
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
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
                <tr key={inv.id} className="hover:bg-teal-500/[0.035]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/leads/${inv.lead_id}`} className="block hover:text-teal-300">
                      <span className="font-mono text-xs text-teal-400/90">{inv.invoice_number}</span>
                      <p className="text-sm text-white">{inv.title}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/leads/${inv.lead_id}`} className="text-slate-300 hover:text-teal-300">
                      {inv.business_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-200">
                    {formatMoney(inv.amount_cents, inv.currency)}
                    {inv.paid_cents > 0 && inv.paid_cents < inv.amount_cents ? (
                      <span className="block text-[11px] text-slate-500">
                        {formatMoney(inv.paid_cents)} paid
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[inv.status]}`}>
                      {INVOICE_STATUS_LABEL[inv.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
