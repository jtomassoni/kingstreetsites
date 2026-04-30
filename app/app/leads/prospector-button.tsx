"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const METRO_ZIPS: Record<string, { zip: string; metro: string }> = {
  "Denver - Highland (80211)": { zip: "80211", metro: "Denver" },
  "Denver - LoDo (80202)": { zip: "80202", metro: "Denver" },
  "Denver - RiNo (80205)": { zip: "80205", metro: "Denver" },
  "Baltimore - Fells Point (21231)": { zip: "21231", metro: "Baltimore" },
  "Baltimore - Canton (21224)": { zip: "21224", metro: "Baltimore" },
  "Baltimore - Federal Hill (21230)": { zip: "21230", metro: "Baltimore" },
  "Baltimore - Hampden (21211)": { zip: "21211", metro: "Baltimore" },
};

const LS_KEY = "kss_prospector_run_id";

type RunStatus = {
  id: string;
  zip: string;
  metro: string;
  status: "running" | "complete" | "failed";
  total: number;
  processed: number;
  inserted: number;
  current_business: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

function pct(run: RunStatus) {
  if (!run.total) return 0;
  return Math.min(100, Math.round((run.processed / run.total) * 100));
}

function eta(run: RunStatus): string {
  if (!run.total || !run.processed) return "estimating…";
  const elapsed = (Date.now() - new Date(run.started_at).getTime()) / 1000;
  const rate = run.processed / elapsed;
  const remaining = (run.total - run.processed) / rate;
  if (remaining < 60) return `~${Math.round(remaining)}s left`;
  return `~${Math.round(remaining / 60)}m left`;
}

export default function ProspectorButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("Denver - Highland (80211)");
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<RunStatus | null>(null);

  const fetchRun = useCallback(async (id: string) => {
    const res = await fetch(`/api/prospector/${id}`);
    if (!res.ok) { localStorage.removeItem(LS_KEY); setRun(null); return; }
    const data: RunStatus = await res.json();
    setRun(data);
    if (data.status !== "running") {
      localStorage.removeItem(LS_KEY);
      if (data.status === "complete") router.refresh();
    }
  }, [router]);

  // On mount, restore any in-progress run from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) fetchRun(saved);
  }, [fetchRun]);

  // Poll every 4s while running
  useEffect(() => {
    if (!run || run.status !== "running") return;
    const id = setInterval(() => fetchRun(run.id), 4000);
    return () => clearInterval(id);
  }, [run, fetchRun]);

  async function startRun() {
    setStarting(true);
    const { zip, metro } = METRO_ZIPS[selected];
    const res = await fetch("/api/prospector", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip, metro }),
    });
    const data = await res.json();
    if (data.runId) {
      localStorage.setItem(LS_KEY, data.runId);
      await fetchRun(data.runId);
    }
    setStarting(false);
    setOpen(false);
  }

  // Active run display
  if (run) {
    const p = pct(run);
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 mb-2">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-sm font-semibold text-white">
              Prospector — {run.metro} {run.zip}
            </span>
            {run.status === "running" && (
              <span className="ml-2 text-xs text-teal-400 animate-pulse">running</span>
            )}
            {run.status === "complete" && (
              <span className="ml-2 text-xs text-teal-400">complete</span>
            )}
            {run.status === "failed" && (
              <span className="ml-2 text-xs text-red-400">failed</span>
            )}
          </div>
          <span className="text-xs text-slate-500 font-mono">{p}%</span>
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-slate-800 mb-2">
          <div
            className={`h-2 rounded-full transition-all duration-1000 ${run.status === "failed" ? "bg-red-500" : "bg-teal-500"}`}
            style={{ width: `${p}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {run.status === "running" && run.current_business
              ? `Processing: ${run.current_business}`
              : run.status === "complete"
              ? `Done — ${run.inserted} leads added`
              : run.status === "failed"
              ? `Error: ${run.error ?? "unknown"}`
              : `${run.processed} / ${run.total || "?"} checked`}
          </span>
          {run.status === "running" && run.processed > 0 && (
            <span>{eta(run)}</span>
          )}
          {run.status !== "running" && (
            <button
              onClick={() => setRun(null)}
              className="text-slate-600 hover:text-slate-400"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    );
  }

  // Launch UI
  return (
    <div className="mb-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-teal-600 hover:bg-teal-500 transition-colors px-4 py-2 text-sm font-semibold text-white"
        >
          Run Prospector
        </button>
      ) : (
        <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4 flex flex-wrap items-center gap-3">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-lg bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white [color-scheme:dark]"
          >
            {Object.keys(METRO_ZIPS).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <button
            onClick={startRun}
            disabled={starting}
            className="rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 transition-colors px-4 py-2 text-sm font-semibold text-white"
          >
            {starting ? "Starting…" : "Run"}
          </button>
          <button onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:text-slate-300">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
