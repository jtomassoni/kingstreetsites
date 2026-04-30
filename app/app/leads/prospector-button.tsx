"use client";

import { useState } from "react";

const METRO_ZIPS: Record<string, string> = {
  "Denver - Highland (80211)": "80211",
  "Denver - LoDo (80202)": "80202",
  "Denver - RiNo (80205)": "80205",
  "Baltimore - Fells Point (21231)": "21231",
  "Baltimore - Canton (21224)": "21224",
  "Baltimore - Federal Hill (21230)": "21230",
  "Baltimore - Hampden (21211)": "21211",
};

export default function ProspectorButton() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("Denver - Highland (80211)");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    setRunning(true);
    setMessage("");
    const zip = METRO_ZIPS[selected];
    const metro = selected.split(" - ")[0];
    try {
      const res = await fetch("/api/prospector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip, metro }),
      });
      const data = await res.json();
      setMessage(data.message ?? "Started. Leads will appear as the agent runs (refresh in ~2 min).");
    } catch {
      setMessage("Failed to start Prospector.");
    }
    setRunning(false);
    setOpen(false);
  }

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
            onClick={run}
            disabled={running}
            className="rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 transition-colors px-4 py-2 text-sm font-semibold text-white"
          >
            {running ? "Starting…" : "Run"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-sm text-slate-500 hover:text-slate-300"
          >
            Cancel
          </button>
        </div>
      )}
      {message && (
        <p className="mt-2 text-sm text-teal-400">{message}</p>
      )}
    </div>
  );
}
