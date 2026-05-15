export type PipelineSummary = {
  total: number;
  pending: number;
  complete: number;
  failed: number;
};

function Tile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint: string;
  accent: "slate" | "amber" | "teal" | "rose";
}) {
  const ring =
    accent === "amber"
      ? "ring-amber-500/20"
      : accent === "teal"
        ? "ring-teal-500/20"
        : accent === "rose"
          ? "ring-rose-500/20"
          : "ring-white/10";
  const glow =
    accent === "amber"
      ? "from-amber-500/10"
      : accent === "teal"
        ? "from-teal-500/10"
        : accent === "rose"
          ? "from-rose-500/10"
          : "from-slate-500/10";

  return (
    <div
      className={`relative flex h-full min-h-[4.5rem] flex-col overflow-hidden rounded-lg border border-white/[0.07] bg-gradient-to-br ${glow} to-slate-950/80 p-2.5 ring-1 sm:min-h-[5rem] sm:rounded-xl sm:p-3 ${ring}`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[10px]">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold tabular-nums tracking-tight text-white sm:mt-2 sm:text-xl">{value}</p>
      <p className="mt-auto pt-1 text-[10px] leading-snug text-slate-500 sm:pt-2 sm:text-[11px]">{hint}</p>
    </div>
  );
}

export function PipelineStatsStrip({ stats }: { stats: PipelineSummary }) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:mb-4 sm:grid-cols-4 sm:gap-3 [&>div]:min-w-0">
      <Tile label="In pipeline" value={stats.total.toLocaleString()} hint="Rows in your leads table" accent="slate" />
      <Tile
        label="Need analysis"
        value={stats.pending.toLocaleString()}
        hint="Ready for Analyze"
        accent="amber"
      />
      <Tile label="Analyzed" value={stats.complete.toLocaleString()} hint="Snapshot + grade saved" accent="teal" />
      <Tile label="Failed" value={stats.failed.toLocaleString()} hint="Retry analyze or inspect lead" accent="rose" />
    </div>
  );
}
