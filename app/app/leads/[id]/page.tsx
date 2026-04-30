import { Pool } from "pg";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import fs from "fs";

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

function ScoreBar({ value, max = 100, color = "teal" }: { value: number | null; max?: number; color?: string }) {
  const pct = value != null ? Math.round((value / max) * 100) : 0;
  const colors: Record<string, string> = {
    teal: "bg-teal-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
  };
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-slate-800">
        <div className={`h-2 rounded-full ${colors[color]}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-mono text-white w-8 text-right">{value ?? "—"}</span>
    </div>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const hasScreenshot = lead.current_screenshot_url && fs.existsSync(lead.current_screenshot_url);

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
            <span className="rounded-full px-3 py-1 text-sm border border-white/10 text-slate-400 capitalize">
              {lead.status}
            </span>
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

        {/* Score breakdown */}
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Score Breakdown</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Opportunity Score</span>
                <span className="text-white font-semibold">{lead.opportunity_score ?? "—"}</span>
              </div>
              <ScoreBar value={lead.opportunity_score} color="teal" />
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Business Viability</span>
              </div>
              <ScoreBar value={lead.business_viability} color="blue" />
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Web Pain</span>
              </div>
              <ScoreBar value={lead.web_pain} color="amber" />
            </div>
          </div>
          <p className="text-xs text-slate-600 mt-4">Opportunity = Viability × Pain ÷ 100</p>
        </div>

        {/* Screenshot */}
        {hasScreenshot && (
          <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-900/60 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Current Site Screenshot</h2>
            <img
              src={`/api/screenshot?path=${encodeURIComponent(lead.current_screenshot_url)}`}
              alt={`${lead.business_name} current site`}
              className="rounded-lg border border-white/10 max-w-sm"
            />
          </div>
        )}

        {/* Dates */}
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Timeline</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Discovered</dt>
              <dd className="text-slate-200">{new Date(lead.created_at).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Last Updated</dt>
              <dd className="text-slate-200">{new Date(lead.updated_at).toLocaleDateString()}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
