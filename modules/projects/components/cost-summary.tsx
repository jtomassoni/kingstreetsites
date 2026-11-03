import { formatCents } from "@projects/lib/money";
import type { CostRollup } from "@projects/types";

export function CostSummary({
  rollup,
  compact = false,
}: {
  rollup: CostRollup;
  compact?: boolean;
}) {
  const remaining = rollup.remaining_cents;
  const over =
    remaining !== null && remaining < 0;

  if (compact) {
    return (
      <p className="text-xs text-ink-muted">
        Est {formatCents(rollup.estimate_cents)}
        {" · "}
        Act {formatCents(rollup.actual_cents)}
        {rollup.budget_cents !== null ? (
          <>
            {" · "}
            Bud {formatCents(rollup.budget_cents)}
          </>
        ) : null}
      </p>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div>
        <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          Estimate
        </dt>
        <dd className="mt-1 text-sm font-semibold text-ink">
          {formatCents(rollup.estimate_cents)}
        </dd>
      </div>
      <div>
        <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          Actual
        </dt>
        <dd className="mt-1 text-sm font-semibold text-ink">
          {formatCents(rollup.actual_cents)}
        </dd>
      </div>
      <div>
        <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          Budget
        </dt>
        <dd className="mt-1 text-sm font-semibold text-ink">
          {formatCents(rollup.budget_cents)}
        </dd>
      </div>
      <div>
        <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          Remaining
        </dt>
        <dd
          className={`mt-1 text-sm font-semibold ${
            over ? "text-red-700" : "text-ink"
          }`}
        >
          {remaining === null ? "—" : formatCents(remaining)}
        </dd>
      </div>
    </dl>
  );
}
