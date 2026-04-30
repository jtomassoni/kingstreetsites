import { Pool } from "pg";

async function getStats() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const [leadsRes, settingsRes, activityRes] = await Promise.all([
      pool.query(`
        select
          count(*) filter (where true) as total,
          count(*) filter (where tier = 'A') as tier_a,
          count(*) filter (where status = 'reached_out') as reached_out,
          count(*) filter (where status = 'clicked') as clicked,
          count(*) filter (where status = 'closed_won') as closed_won
        from leads
      `),
      pool.query(`select key, value from settings where key in ('external_comms','auto_send')`),
      pool.query(`select agent, action, created_at from audit_log order by created_at desc limit 10`),
    ]);
    const settings: Record<string, boolean> = {};
    for (const row of settingsRes.rows) settings[row.key] = row.value === true || row.value === "true";
    return { stats: leadsRes.rows[0], settings, activity: activityRes.rows };
  } finally {
    await pool.end();
  }
}

export default async function DashboardPage() {
  const { stats, settings, activity } = await getStats();

  const cards = [
    { label: "Total Leads", value: stats.total },
    { label: "Tier A", value: stats.tier_a },
    { label: "Reached Out", value: stats.reached_out },
    { label: "Clicked", value: stats.clicked },
    { label: "Closed Won", value: stats.closed_won },
  ];

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-white mb-2">Dashboard</h1>

      {/* Kill switch banners */}
      {!settings.external_comms && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          External Comms is <strong>OFF</strong> — agents run internally only. Flip it in Agent Controls to enable outbound.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-2xl font-semibold text-white">{c.value ?? 0}</p>
            <p className="text-xs text-slate-400 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Agent activity */}
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-widest">Recent Agent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {activity.map((row: { agent: string; action: string; created_at: string }, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-xs text-teal-400 w-20 shrink-0">{row.agent}</span>
                <span className="text-slate-300 flex-1">{row.action}</span>
                <span className="text-slate-600 text-xs shrink-0">
                  {new Date(row.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
