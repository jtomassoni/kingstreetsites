import BillingPanel, { type InvoiceRow } from "../../components/billing-panel";
import { getLead, getLeadInvoices } from "../data";

export default async function LeadBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) return null;

  const invoices = await getLeadInvoices(id);

  return (
    <BillingPanel
      leadId={lead.id}
      initialInvoices={invoices as InvoiceRow[]}
      initialBarterEnabled={Boolean(lead.barter_payments_enabled)}
    />
  );
}
