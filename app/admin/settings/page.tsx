import { getDbPool } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { crm } from "@/lib/admin-ui";

async function getSettings(): Promise<Record<string, boolean>> {
  const pool = getDbPool();
  const { rows } = await pool.query(`select key, value from settings`);
  const out: Record<string, boolean> = {};
  for (const r of rows) out[r.key] = r.value === true || r.value === "true";
  return out;
}

async function toggleSetting(key: string, value: boolean) {
  "use server";
  const pool = getDbPool();
  await pool.query(
    `update settings set value = $1::jsonb, updated_at = now() where key = $2`,
    [JSON.stringify(value), key]
  );
  await pool.query(
    `insert into audit_log (agent, action, payload) values ('jt', $1, $2::jsonb)`,
    [`toggle_setting`, JSON.stringify({ key, value })]
  );
  revalidatePath("/admin/settings");
  revalidatePath("/admin/leads");
}

const TOGGLES = [
  {
    key: "auto_send",
    label: "Auto-send",
    description:
      "When ON, queued agent emails can send without your review. Keep OFF if you send everything yourself from the conversation thread.",
    dangerLabel: "Skips your approval queue",
  },
];

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="max-w-2xl">
      <header className="mb-8">
        <h1 className={crm.pageTitle}>Settings</h1>
        <p className={crm.pageLead}>
          Manual sends from conversations always go out. Auto-send stays off unless you want queued agent emails to skip review.
        </p>
      </header>

      <div className="space-y-4">
        {TOGGLES.map((toggle) => {
          const isOn = settings[toggle.key] ?? false;
          const next = !isOn;
          return (
            <div key={toggle.key} className={crm.card}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <h2 className="font-medium text-crm-text">{toggle.label}</h2>
                    <span className={crm.badge(isOn ? "good" : "neutral")}>{isOn ? "ON" : "OFF"}</span>
                  </div>
                  <p className="text-sm text-crm-muted">{toggle.description}</p>
                  {next ? <p className="mt-2 text-xs text-amber-400">{toggle.dangerLabel}</p> : null}
                </div>
                <form
                  action={async () => {
                    "use server";
                    await toggleSetting(toggle.key, next);
                  }}
                >
                  <button type="submit" className={isOn ? crm.btn : crm.btnPrimary}>
                    Turn {next ? "ON" : "OFF"}
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
