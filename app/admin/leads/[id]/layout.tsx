import { notFound } from "next/navigation";
import Link from "next/link";
import StatusSelect from "../components/status-select";
import { LeadStatus } from "@/lib/lead-status";
import { getLead } from "./data";
import { LeadDetailSubNav } from "./lead-detail-subnav";
import { crm, gradeTone, tierTone } from "@/lib/admin-ui";

const TIER_LABEL: Record<string, string> = {
  A: "Tier A",
  B: "Tier B",
  C: "Tier C",
  reject: "Skip",
};

export default async function LeadDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const isCustomer = lead.status === "closed_won";

  return (
    <div>
      <header className={crm.recordHeader}>
        <Link
          href={isCustomer ? "/admin/leads?view=customers" : "/admin/leads"}
          className={`${crm.btnGhost} inline-block text-xs`}
        >
          ← Back to {isCustomer ? "customers" : "leads"}
        </Link>

        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {isCustomer ? <span className={crm.badge("good")}>Customer</span> : null}
              {lead.tier ? (
                <span className={crm.badge(tierTone(lead.tier))}>
                  {TIER_LABEL[lead.tier] ?? lead.tier}
                </span>
              ) : null}
              {lead.site_grade && lead.analysis_status === "complete" ? (
                <span className={crm.badge(gradeTone(lead.site_grade))}>Grade {lead.site_grade}</span>
              ) : null}
            </div>
            <h1 className={`${crm.recordTitle} mt-2`}>{lead.business_name}</h1>
            {lead.address ? <p className={crm.recordMeta}>{lead.address}</p> : null}
          </div>

          <div className={crm.recordActions}>
            <StatusSelect leadId={lead.id} status={lead.status as LeadStatus} />
          </div>
        </div>

        <div className="mt-5">
          <LeadDetailSubNav leadId={id} />
        </div>
      </header>

      {children}
    </div>
  );
}
