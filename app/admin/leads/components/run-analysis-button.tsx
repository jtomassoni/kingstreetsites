"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crm } from "@/lib/admin-ui";
import { useToast } from "@/app/admin/components/toast";

type RunStatus = {
  id: string;
  status: "running" | "complete" | "failed";
  error: string | null;
  current_business: string | null;
};

export default function RunAnalysisButton({
  leadId,
  analysisStatus,
}: {
  leadId: string;
  analysisStatus: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<RunStatus | null>(null);

  // Stay in a busy state through complete until router.refresh swaps in results.
  const busy = starting || (run != null && run.status !== "failed");

  const fetchRun = useCallback(async (id: string) => {
    const res = await fetch(`/api/analyzer/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as RunStatus;
  }, []);

  useEffect(() => {
    if (!run || run.status !== "running") return;
    const timer = setInterval(async () => {
      const next = await fetchRun(run.id);
      if (!next) return;
      setRun(next);
      if (next.status === "complete") {
        toast({
          title: "Site analysis complete",
          description: "Grade and snapshot saved.",
          tone: "success",
        });
        startTransition(() => router.refresh());
      } else if (next.status === "failed") {
        toast({
          title: "Site analysis failed",
          description: next.error ?? "Check the analyzer worker log.",
          tone: "error",
        });
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [run, fetchRun, router, toast]);

  async function start() {
    setStarting(true);
    setRun(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/analyze`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Could not start analysis",
          description: data?.error ?? "Try again in a moment.",
          tone: "error",
        });
        return;
      }
      const next = await fetchRun(data.runId as string);
      setRun(
        next ?? {
          id: data.runId as string,
          status: "running",
          error: null,
          current_business: null,
        }
      );
    } finally {
      setStarting(false);
    }
  }

  const label =
    busy
      ? "Analyzing…"
      : analysisStatus === "failed" || run?.status === "failed"
        ? "Retry analysis"
        : "Run analysis";

  return (
    <div className="space-y-3">
      <p className="text-sm text-crm-muted">
        {busy
          ? run?.status === "complete"
            ? "Finishing up — loading results…"
            : run?.current_business
              ? run.current_business
              : "Visiting the site and scoring UX signals…"
          : analysisStatus === "failed" || run?.status === "failed"
            ? "Last run failed. You can retry from here."
            : "Not analyzed yet. Run it here for this lead."}
      </p>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={`${crm.btnPrimary} w-full`}
      >
        {label}
      </button>
      {run?.status === "failed" && run.error ? (
        <p className="text-xs text-red-300/90">{run.error}</p>
      ) : null}
    </div>
  );
}
