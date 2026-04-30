import { Pool } from "pg";
import { revalidatePath } from "next/cache";

async function getSettings(): Promise<Record<string, boolean>> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(`select key, value from settings`);
    const out: Record<string, boolean> = {};
    for (const r of rows) out[r.key] = r.value === true || r.value === "true";
    return out;
  } finally {
    await pool.end();
  }
}

async function toggleSetting(key: string, value: boolean) {
  "use server";
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      `update settings set value = $1::jsonb, updated_at = now() where key = $2`,
      [JSON.stringify(value), key]
    );
    await pool.query(
      `insert into audit_log (agent, action, payload) values ('jt', $1, $2::jsonb)`,
      [`toggle_setting`, JSON.stringify({ key, value })]
    );
  } finally {
    await pool.end();
  }
  revalidatePath("/app/settings");
  revalidatePath("/app/dashboard");
}

const TOGGLES = [
  {
    key: "external_comms",
    label: "External Comms",
    description: "Master kill switch. When OFF, agents stage everything internally but nothing is sent outside. Flip ON only when you're ready to run real outreach.",
    dangerLabel: "Enables outbound email to real prospects",
  },
  {
    key: "auto_send",
    label: "Auto-Send",
    description: "When ON, Concierge sends queued emails automatically without waiting for your approval. Keep OFF during Phases 1–4.",
    dangerLabel: "Skips your approval queue",
  },
];

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-white mb-2">Agent Controls</h1>
      <p className="text-slate-400 text-sm mb-8">Kill switches and operational toggles. All changes are logged to the audit trail.</p>

      <div className="space-y-4">
        {TOGGLES.map((toggle) => {
          const isOn = settings[toggle.key] ?? false;
          const next = !isOn;
          return (
            <div key={toggle.key} className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-semibold text-white">{toggle.label}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${isOn ? "bg-teal-500/20 text-teal-400" : "bg-slate-700 text-slate-400"}`}>
                      {isOn ? "ON" : "OFF"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400">{toggle.description}</p>
                  {next && (
                    <p className="mt-2 text-xs text-amber-400">⚠ {toggle.dangerLabel}</p>
                  )}
                </div>
                <form
                  action={async () => {
                    "use server";
                    await toggleSetting(toggle.key, next);
                  }}
                >
                  <button
                    type="submit"
                    className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      isOn
                        ? "bg-slate-700 hover:bg-slate-600 text-white"
                        : "bg-teal-600 hover:bg-teal-500 text-white"
                    }`}
                  >
                    Turn {next ? "ON" : "OFF"}
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 rounded-xl border border-white/10 bg-slate-900/60 p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-1 uppercase tracking-widest">Coming soon</h2>
        <ul className="text-sm text-slate-500 space-y-1 mt-2">
          <li>Per-agent enable / disable</li>
          <li>Paced-send rate limits</li>
          <li>Suppression list management</li>
          <li>API key health checks</li>
          <li>User management</li>
        </ul>
      </div>
    </div>
  );
}
