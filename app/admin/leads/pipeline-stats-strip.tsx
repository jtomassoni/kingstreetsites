import { crm } from "@/lib/admin-ui";

export type PipelineSummary = {
  total: number;
  pending: number;
  complete: number;
  failed: number;
};

function Tile({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className={crm.statTile}>
      <p className={crm.statLabel}>{label}</p>
      <p className={crm.statValue}>{value}</p>
      <p className={crm.statHint}>{hint}</p>
    </div>
  );
}

export function PipelineStatsStrip({ stats }: { stats: PipelineSummary }) {
  return (
    <div className={`${crm.statGrid} [&>div]:min-w-0`}>
      <Tile label="In pipeline" value={stats.total.toLocaleString()} hint="Rows in your leads table" />
      <Tile label="Need analysis" value={stats.pending.toLocaleString()} hint="Ready for Analyze" />
      <Tile label="Analyzed" value={stats.complete.toLocaleString()} hint="Snapshot + grade saved" />
      <Tile label="Failed" value={stats.failed.toLocaleString()} hint="Retry analyze or inspect lead" />
    </div>
  );
}
