import { Pool } from "pg";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import fs from "fs";
import StatusSelect from "../components/status-select";
import OutreachPanel from "../components/outreach-panel";
import { LeadStatus } from "@/lib/lead-status";

const TIER_COLOR: Record<string, string> = {
  A: "text-teal-400 bg-teal-400/10 border-teal-400/20",
  B: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  C: "text-slate-400 bg-slate-400/10 border-slate-400/20",
  reject: "text-red-400 bg-red-400/10 border-red-400/20",
};

async function getLead(id: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(`select * from leads where id = $1`, [id]);
    return rows[0] ?? null;
  } finally {
    await pool.end();
  }
}

async function getLeadTimeline(id: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
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

        union all

        select
          id::text,
          'message'::text as source,
          case when direction = 'inbound' then 'email_received' else 'email_sent' end as event_type,
          case when direction = 'inbound' then 'Reply received' else 'Email sent' end as title,
          concat_ws(
            E'\\n',
            coalesce(subject, '(no subject)'),
            coalesce(body_text, '')
          ) as body,
          created_at
        from lead_messages
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
  } finally {
    await pool.end();
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
  // For web pain, "middle-high" is best opportunity.
  if (value == null) return "amber";
  if (value >= 45 && value <= 85) return "green";
  if ((value >= 30 && value < 45) || (value > 85 && value <= 95)) return "amber";
  return "red";
}

function webPainContext(value: number | null | undefined) {
  if (value == null) return "Web pain unknown; do a quick manual website check before outreach.";
  if (value >= 45 && value <= 85) return "Good target zone: clear problems without looking completely abandoned.";
  if (value < 45) return "Low pain: site is likely decent, so lead with conversion improvements not a rebuild.";
  if (value > 85 && value <= 95) return "Very high pain: strong need, but qualify quickly to confirm they will invest.";
  return "Extreme pain: may be closed/inactive or low intent; qualify before deep pitching.";
}

function buildActionBrief(lead: {
  opportunity_score: number | null;
  business_viability: number | null;
  web_pain: number | null;
  website_url?: string | null;
  google_review_count?: number | null;
}) {
  const opp = lead.opportunity_score ?? 0;
  const viability = lead.business_viability ?? 0;
  const pain = lead.web_pain ?? 0;
  const reviews = lead.google_review_count ?? 0;

  const meaning: string[] = [];
  if (!lead.website_url) meaning.push("No website found: easy opening for outreach.");
  if (pain >= 70) meaning.push("Current web presence is weak enough to create visible wins quickly.");
  if (viability >= 70) meaning.push("Business looks stable enough to pay for a practical website package.");
  if (reviews >= 50) meaning.push("Solid local reputation means website improvements can convert existing demand.");
  if (!meaning.length) meaning.push("Potential exists, but qualification call should confirm budget and urgency.");

  let priority = "Low";
  if (opp >= 45) priority = "High";
  else if (opp >= 25) priority = "Medium";

  let nextStep = "Send a light-touch intro and ask if they want a simple website refresh quote.";
  if (!lead.website_url) {
    nextStep = "Lead with a one-page launch offer (hours, menu, map, SEO basics) and promise quick turnaround.";
  } else if (pain >= 60) {
    nextStep = "Open with 2-3 specific website problems you can fix this week, then offer a scoped starter package.";
  } else if (viability < 45) {
    nextStep = "Qualify first: ask who decides, budget range, and timing before spending effort on a full pitch.";
  }

  return { priority, meaning, nextStep };
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const timeline = await getLeadTimeline(id);

  const hasScreenshot = lead.current_screenshot_url && fs.existsSync(lead.current_screenshot_url);
  const brief = buildActionBrief(lead);

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link href="/app/leads" className="text-sm text-slate-500 hover:text-slate-300 mb-3 inline-block">← Leads</Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">{lead.business_name}</h1>
            <p className="text-slate-400 mt-1">{lead.address}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lead.tier && (
              <span className={`rounded-full px-3 py-1 text-sm font-bold border ${TIER_COLOR[lead.tier] ?? ""}`}>
                Tier {lead.tier}
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
            {[
              ["Phone", lead.phone],
              ["Website", lead.website_url ? <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline truncate block max-w-[200px]">{lead.website_url}</a> : null],
              ["Cuisine", lead.cuisine],
              ["Metro / ZIP", `${lead.metro} ${lead.zip}`],
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
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Action Plan</h2>
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

        {/* Outreach workspace */}
        <div className="md:col-span-2">
          <OutreachPanel leadId={lead.id} defaultToEmail={null} />
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

        {/* Timeline */}
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Timeline</h2>
          <div className="space-y-3">
            <div className="text-xs text-slate-500">
              Discovered {new Date(lead.created_at).toLocaleDateString()} · Last updated{" "}
              {new Date(lead.updated_at).toLocaleDateString()}
            </div>
            {timeline.length === 0 ? (
              <p className="text-sm text-slate-500">No outreach activity yet.</p>
            ) : (
              <ul className="space-y-2">
                {timeline.map((event: {
                  id: string;
                  title: string;
                  body: string | null;
                  created_at: string;
                  source: string;
                }) => (
                  <li key={`${event.source}-${event.id}`} className="rounded-lg border border-white/10 p-3">
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="text-slate-300">{event.title}</span>
                      <span className="text-slate-500">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                    {event.body && (
                      <p className="text-sm text-slate-400 mt-1 whitespace-pre-wrap">{event.body}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
