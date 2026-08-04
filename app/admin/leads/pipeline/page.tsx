import Link from "next/link";
import ProspectorButton from "../prospector-button";
import AnalyzerButton from "../analyzer-button";
import { PipelineStatsStrip } from "../pipeline-stats-strip";
import { getPipelineSummary } from "../data";
import { crm } from "@/lib/admin-ui";

const TOOL_GRID =
  "grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start lg:max-h-[min(32rem,calc(100dvh-15rem))] lg:overflow-y-auto";

export default async function LeadsPipelinePage() {
  const pipeline = await getPipelineSummary();

  return (
    <div className="w-full">
      <header className="mb-6">
        <h1 className={crm.pageTitle}>Find leads</h1>
        <p className={crm.pageLead}>
          Scrape places, then analyze to surface weak or missing websites — your rebuild targets. Day-to-day outreach
          stays on{" "}
          <Link href="/admin/leads" className={crm.link}>
            Leads
          </Link>{" "}
          (sorted worst sites first).
        </p>
      </header>

      <div className={`${crm.panel} p-5`}>
        <div className="mb-4 flex flex-col gap-1 border-b border-crm-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-crm-text">Pipeline overview</p>
          <p className="text-xs text-crm-faint">Counts reflect your full leads table (not the 200-row preview).</p>
        </div>

        <PipelineStatsStrip stats={pipeline} />

        <div className={TOOL_GRID}>
          <ProspectorButton pipeline={pipeline} />
          <AnalyzerButton pipeline={pipeline} />
          <aside className={`${crm.card} min-h-[240px] sm:min-h-[252px]`}>
            <h2 className={crm.sectionTitle}>How this fits together</h2>
            <ol className="mt-3 space-y-3 text-sm leading-snug text-crm-muted">
              <li>
                <span className="font-medium text-crm-text">1. Scrape</span> — Google Places into your pipeline.
              </li>
              <li>
                <span className="font-medium text-crm-text">2. Analyze</span> — grade sites; F/C = rebuild targets.
              </li>
              <li>
                <span className="font-medium text-crm-text">3. Leads</span> — pitch affordable rebuilds + hourly
                updates.
              </li>
            </ol>
          </aside>
        </div>
      </div>
    </div>
  );
}
