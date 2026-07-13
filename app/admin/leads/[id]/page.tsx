import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import fs from "fs";
import StatusSelect from "../components/status-select";
import ConversationThread from "../components/conversation-thread";
import NotesPanel from "../components/notes-panel";
import ContactEmailField from "../components/contact-email-field";
import BillingPanel, { type InvoiceRow } from "../components/billing-panel";
import ActivityLog from "../components/activity-log";
import { LeadStatus } from "@/lib/lead-status";
import { ensureLeadCrmSchema } from "@/lib/lead-schema";
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import { ensureBillingSchema } from "@/lib/billing";
import { dbPool } from "@/lib/db";
import type { ConversationMessage } from "../components/conversation-thread";

const TIER_COLOR: Record<string, string> = {
  A: "text-teal-400 bg-teal-400/10 border-teal-400/20",
  B: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  C: "text-slate-400 bg-slate-400/10 border-slate-400/20",
  reject: "text-red-400 bg-red-400/10 border-red-400/20",
};

async function getLead(id: string) {
  await ensureLeadCrmSchema(dbPool);
  const { rows } = await dbPool.query(`select * from leads where id = $1`, [id]);
  return rows[0] ?? null;
}

async function getLeadMessages(id: string) {
  await ensureOutreachSchema(dbPool);
  try {
    const { rows } = await dbPool.query(
      `select id, direction, from_email, to_email, subject, body_text, created_at
       from lead_messages
       where lead_id = $1
       order by created_at asc`,
      [id]
    );
    return rows;
  } catch {
    return [];
  }
}

async function getLeadTimeline(id: string) {
  await ensureOutreachSchema(dbPool);
  try {
    const { rows } = await dbPool.query(
      `
      select * from (
        select
          id::text,
          'timeline'::text as source,
          event_type,
          title,
          body,
          created_at
        from lead_timeline_events
        where lead_id = $1
          and event_type not in ('email_sent', 'email_received')

        union all

        select
          id::text,
          'note'::text as source,
          'note_added'::text as event_type,
          'Note added'::text as title,
          note as body,
          created_at
        from lead_notes
        where lead_id = $1
      ) events
      order by created_at desc
      limit 100
      `,
      [id]
    );
    return rows;
  } catch {
    return [];
  }
}

async function getLeadInvoices(id: string) {
  await ensureBillingSchema(dbPool);
  try {
    const { rows } = await dbPool.query(
      `select i.*,
              coalesce((select sum(p.amount_cents) from invoice_payments p where p.invoice_id = i.id), 0)::int as paid_cents
       from invoices i
       where i.lead_id = $1
       order by i.created_at desc`,
      [id]
    );
    return rows;
  } catch {
    return [];
  }
}

function ScoreBar({ value, max = 100, color = "teal" }: { value: number | null; max?: number; color?: string }) {
  const pct = value != null ? Math.round((value / max) * 100) : 0;
  const colors: Record<string, string> = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    teal: "bg-teal-500",
  };
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-slate-800">
        <div className={`h-2 rounded-full ${colors[color]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function scoreBand(value: number | null | undefined) {
  if (value == null) return "Unknown";
  if (value >= 75) return "High";
  if (value >= 45) return "Medium";
  return "Low";
}

function toneForHigherIsBetter(value: number | null | undefined) {
  if (value == null) return "amber";
  if (value >= 75) return "green";
  if (value >= 45) return "amber";
  return "red";
}

function toneForWebPain(value: number | null | undefined) {
  // Higher pain = better rebuild target for our model.
  if (value == null) return "amber";
  if (value >= 70) return "green";
  if (value >= 45) return "amber";
  return "red";
}

function webPainContext(value: number | null | undefined) {
  if (value == null) return "Web pain unknown — open the site and judge how embarrassing it is before outreach.";
  if (value >= 85) {
    return "Prime rebuild target: missing, broken, or unusable site. Lead with an affordable flat rebuild + hourly updates.";
  }
  if (value >= 70) {
    return "Strong rebuild target: dated / painful enough that a cheaper rebuild is an easy sell vs agency pricing.";
  }
  if (value >= 45) {
    return "Mixed: some friction, but not a disaster. Pitch a focused refresh or skip for worse sites first.";
  }
  return "Low pain: site is already decent. Deprioritize — only offer light hourly polish if they ask.";
}

function buildActionBrief(lead: {
  opportunity_score: number | null;
  business_viability: number | null;
  web_pain: number | null;
  website_url?: string | null;
  google_review_count?: number | null;
  site_grade?: string | null;
}) {
  const opp = lead.opportunity_score ?? 0;
  const viability = lead.business_viability ?? 0;
  const pain = lead.web_pain ?? 0;
  const reviews = lead.google_review_count ?? 0;
  const grade = lead.site_grade;

  const meaning: string[] = [];
  if (!lead.website_url || grade === "F") {
    meaning.push("Website is missing or unusable — ideal for a simple affordable rebuild.");
  } else if (pain >= 70 || grade === "C") {
    meaning.push("Site looks bad enough that a cheaper rebuild beats incremental tweaks.");
  }
  if (viability >= 55) {
    meaning.push("Business looks real enough to pay a practical package (not a vanity agency build).");
  }
  if (reviews >= 30) {
    meaning.push("Local demand exists — a clearer site + menu/reservations should convert better.");
  }
  if (!meaning.length) {
    meaning.push("Not a top rebuild target — park it and work worse sites first.");
  }

  let priority = "Low";
  if (grade === "F" || pain >= 80 || opp >= 55) priority = "High";
  else if (grade === "C" || pain >= 60 || opp >= 35) priority = "Medium";

  let nextStep =
    "Skip or park — better rebuild targets exist. Offer hourly polish only if they reach out.";
  if (!lead.website_url || grade === "F") {
    nextStep =
      "Open with a flat affordable rebuild (home, menu, hours, map, contact) and clear hourly rate for updates after launch.";
  } else if (pain >= 70 || grade === "C") {
    nextStep =
      "Call out 2–3 specific site problems, quote a rebuild for less than agency rates, then hourly for ongoing tweaks.";
  } else if (pain >= 45) {
    nextStep =
      "Light touch: ask if they want a scoped refresh; don’t oversell a full rebuild unless they hate the current site.";
  }

  return { priority, meaning, nextStep };
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const [timeline, messages, invoices] = await Promise.all([
    getLeadTimeline(id),
    getLeadMessages(id),
    getLeadInvoices(id),
  ]);

  const hasScreenshot = lead.current_screenshot_url && fs.existsSync(lead.current_screenshot_url);
  const brief = buildActionBrief(lead);
  const isCustomer = lead.status === "closed_won";

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link href={isCustomer ? "/admin/leads?view=customers" : "/admin/leads"} className="text-sm text-slate-500 hover:text-slate-300 mb-3 inline-block">
          ← {isCustomer ? "Customers" : "Leads"}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            {isCustomer ? (
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400/90">Customer</p>
            ) : null}
            <h1 className="text-2xl font-semibold text-white">{lead.business_name}</h1>
            <p className="text-slate-400 mt-1">{lead.address}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lead.tier && (
              <span className={`rounded-full px-3 py-1 text-sm font-bold border ${TIER_COLOR[lead.tier] ?? ""}`}>
                {lead.tier === "reject" ? "Skip" : `Tier ${lead.tier}`}
              </span>
            )}
            <StatusSelect leadId={lead.id} status={lead.status as LeadStatus} />
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Business info */}
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Business Info</h2>
          <dl className="space-y-2 text-sm">
            <ContactEmailField leadId={lead.id} initialEmail={lead.contact_email} />
            {[
              ["Phone", lead.phone],
              ["Website", lead.website_url ? <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline truncate block max-w-[200px]">{lead.website_url}</a> : null],
              ["Cuisine", lead.cuisine],
              ["Metro / ZIP", [lead.metro, lead.zip].filter(Boolean).join(" ") || null],
              ["Google Rating", lead.google_rating ? `${lead.google_rating} ★ (${lead.google_review_count} reviews)` : null],
            ].map(([label, value]) => value ? (
              <div key={String(label)} className="flex justify-between gap-2">
                <dt className="text-slate-500 shrink-0">{label}</dt>
                <dd className="text-slate-200 text-right">{value}</dd>
              </div>
            ) : null)}
          </dl>
        </div>

        {/* Site snapshot */}
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Site Snapshot</h2>
            {lead.analyzed_at
              ? <span className="text-[11px] text-slate-500">Analyzed {new Date(lead.analyzed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
              : <span className="text-[11px] text-amber-500/80">Analysis not run</span>}
          </div>
          {lead.analysis_status === "pending" ? (
            <p className="text-sm text-slate-500 italic">Run &ldquo;Analyze leads&rdquo; to generate a site snapshot for this lead.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Grade</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                  lead.site_grade === "F" ? "bg-red-500/15 text-red-300 border-red-500/25" :
                  lead.site_grade === "C" ? "bg-amber-500/15 text-amber-300 border-amber-500/25" :
                  lead.site_grade === "B" ? "bg-blue-500/15 text-blue-300 border-blue-500/25" :
                  lead.site_grade === "A" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" :
                  "bg-slate-700 text-slate-300 border-white/10"
                }`}>
                  {lead.site_grade ?? "—"}
                </span>
              </div>
              <p className="text-slate-200">
                <span className="text-slate-500">Pitch angle:</span>{" "}
                {lead.pitch_angle ?? "—"}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {([
                  ["Ordering", lead.has_online_ordering],
                  ["Reservations", lead.has_reservations],
                  ["Real menu", lead.has_real_menu],
                  ["Mobile ready", lead.mobile_ready],
                  ["Accessibility", lead.accessibility_ok],
                  ["Modern look", lead.looks_modern],
                ] as [string, boolean | null][]).map(([label, val]) => (
                  <div key={label} className={`rounded border px-2 py-1 flex justify-between ${val ? "border-teal-500/20 text-teal-300" : "border-white/10 text-slate-500"}`}>
                    <span>{label}</span>
                    <span>{val ? "Yes" : "No"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action brief */}
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Rebuild pitch</h2>
          <div className="space-y-3 text-sm">
            <p className="text-slate-200">
              <span className="text-slate-500">Priority:</span>{" "}
              <span className={brief.priority === "High" ? "text-teal-400" : brief.priority === "Medium" ? "text-amber-400" : "text-slate-300"}>
                {brief.priority}
              </span>
            </p>
            <div>
              <p className="text-slate-500 mb-1">Why this is actionable</p>
              <ul className="text-slate-200 space-y-1 list-disc pl-5">
                {brief.meaning.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <p className="text-slate-200">
              <span className="text-slate-500">Recommended next step:</span> {brief.nextStep}
            </p>
          </div>
        </div>

        {/* Conversation */}
        <div className="md:col-span-2">
          <ConversationThread
            leadId={lead.id}
            defaultToEmail={lead.contact_email ?? null}
            initialMessages={messages as ConversationMessage[]}
          />
        </div>

        {/* Billing */}
        <div className="md:col-span-2">
          <BillingPanel
            leadId={lead.id}
            initialInvoices={invoices as InvoiceRow[]}
            initialBarterEnabled={Boolean(lead.barter_payments_enabled)}
          />
        </div>

        {/* Notes */}
        <div className="md:col-span-2">
          <NotesPanel leadId={lead.id} />
        </div>

        {/* Screenshot */}
        {hasScreenshot && (
          <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-900/60 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Current Site Screenshot</h2>
            <Image
              src={`/api/screenshot?path=${encodeURIComponent(lead.current_screenshot_url)}`}
              alt={`${lead.business_name} current site`}
              width={800}
              height={500}
              className="rounded-lg border border-white/10 max-w-sm h-auto"
            />
          </div>
        )}

        {/* Activity timeline (notes + status — emails live in Conversation) */}
        <div className="md:col-span-2">
          <ActivityLog
            events={timeline}
            discoveredAt={lead.created_at}
            updatedAt={lead.updated_at}
          />
        </div>
      </div>
    </div>
  );
}
