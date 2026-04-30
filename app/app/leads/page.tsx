import { Pool } from "pg";
import Link from "next/link";

const TIER_COLOR: Record<string, string> = {
  A: "text-teal-400 bg-teal-400/10",
  B: "text-blue-400 bg-blue-400/10",
  C: "text-slate-400 bg-slate-400/10",
  reject: "text-red-400 bg-red-400/10",
};

async function getLeads(tier?: string, status?: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const conditions: string[] = [];
    const values: string[] = [];
    if (tier) { conditions.push(`tier = $${values.length + 1}`); values.push(tier); }
    if (status) { conditions.push(`status = $${values.length + 1}`); values.push(status); }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(
      `select id, business_name, metro, zip, cuisine, tier, status, opportunity_score, google_rating, google_review_count, created_at
       from leads ${where}
       order by opportunity_score desc nulls last, created_at desc
       limit 200`,
      values
    );
    return rows;
  } finally {
    await pool.end();
  }
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; status?: string }>;
}) {
  const { tier, status } = await searchParams;
  const leads = await getLeads(tier, status);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Leads</h1>
        <span className="text-sm text-slate-500">{leads.length} results</span>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["A", "B", "C"].map((t) => (
          <Link
            key={t}
            href={`/app/leads?tier=${t}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${tier === t ? "bg-teal-600 border-teal-600 text-white" : "border-white/10 text-slate-400 hover:text-white"}`}
          >
            Tier {t}
          </Link>
        ))}
        {tier || status ? (
          <Link href="/app/leads" className="rounded-full px-3 py-1 text-xs border border-white/10 text-slate-500 hover:text-white">
            Clear
          </Link>
        ) : null}
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-10 text-center">
          <p className="text-slate-400">No leads yet. Run the Prospector to populate this list.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 bg-slate-900/80">
              <tr>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-slate-500 font-semibold">Business</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-slate-500 font-semibold">Location</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-slate-500 font-semibold">Tier</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-slate-500 font-semibold">Score</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-slate-500 font-semibold">Status</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-slate-500 font-semibold">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {leads.map((lead: {
                id: string;
                business_name: string;
                metro: string;
                zip: string;
                cuisine: string;
                tier: string;
                status: string;
                opportunity_score: number;
                google_rating: number;
                google_review_count: number;
              }) => (
                <tr key={lead.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/app/leads/${lead.id}`} className="text-white hover:text-teal-400 font-medium">
                      {lead.business_name}
                    </Link>
                    {lead.cuisine && <span className="ml-2 text-xs text-slate-500">{lead.cuisine}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{lead.metro} {lead.zip}</td>
                  <td className="px-4 py-3">
                    {lead.tier && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_COLOR[lead.tier] ?? ""}`}>
                        {lead.tier}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-mono">{lead.opportunity_score ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400 capitalize">{lead.status}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {lead.google_rating ? `${lead.google_rating} (${lead.google_review_count})` : "—"}
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
