import Link from "next/link";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/lead-status";
import type { PeopleView } from "./data";

type Props = {
  view: PeopleView;
  q?: string;
  status?: string;
  tier?: string;
  sort?: string;
};

function defaultSort(view: PeopleView) {
  return view === "customers" ? "newest" : "grade";
}

function buildHref(base: Props, patch: Partial<Props>) {
  const next = { ...base, ...patch };
  const params = new URLSearchParams();
  if (next.view === "customers") params.set("view", "customers");
  if (next.q?.trim()) params.set("q", next.q.trim());
  if (next.view === "leads" && next.status) params.set("status", next.status);
  if (next.tier) params.set("tier", next.tier);
  const fallback = defaultSort(next.view);
  if (next.sort && next.sort !== fallback) params.set("sort", next.sort);
  const qs = params.toString();
  return qs ? `/admin/leads?${qs}` : "/admin/leads";
}

const LEAD_STATUS_FILTERS = LEAD_STATUSES.filter((s) => s !== "closed_won");

export default function LeadsToolbar({ view, q, status, tier, sort }: Props) {
  const activeSort = sort ?? defaultSort(view);
  const current = { view, q, status, tier, sort: activeSort };
  const SORT_OPTS =
    view === "customers"
      ? [{ key: "newest", label: "Newest" }]
      : [
          { key: "grade", label: "Worst sites first" },
          { key: "opportunity", label: "Best rebuild targets" },
          { key: "newest", label: "Newest" },
          { key: "pending", label: "Needs analysis" },
        ];
  const hasFilters = Boolean(q?.trim() || (view === "leads" && status) || tier);

  return (
    <div className="relative mb-6 space-y-3 rounded-xl border border-white/[0.06] bg-slate-900/40 p-3 ring-1 ring-white/[0.04]">
      <form method="get" action="/admin/leads" className="flex flex-wrap items-center gap-2">
        {view === "customers" ? <input type="hidden" name="view" value="customers" /> : null}
        {activeSort !== defaultSort(view) ? (
          <input type="hidden" name="sort" value={activeSort} />
        ) : null}
        {view === "leads" && status ? <input type="hidden" name="status" value={status} /> : null}
        {tier ? <input type="hidden" name="tier" value={tier} /> : null}
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Search</span>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder={
              view === "customers"
                ? "Search customers…"
                : "Search name, email, phone, metro, ZIP…"
            }
            className="w-full rounded-lg border border-white/10 bg-slate-950/80 py-2 pl-3 pr-20 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500/40"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            Search
          </button>
        </label>
        {hasFilters ? (
          <Link
            href={buildHref({ view, sort: activeSort }, { q: undefined, status: undefined, tier: undefined })}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-white/20 hover:text-slate-300"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {view === "leads" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</span>
          <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-slate-950/80 p-1 shadow-inner shadow-black/40">
            <Link
              href={buildHref(current, { status: undefined })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                !status
                  ? "bg-gradient-to-b from-teal-500/25 to-teal-600/15 text-teal-100 shadow-sm ring-1 ring-teal-500/30"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              All
            </Link>
            {LEAD_STATUS_FILTERS.map((s) => (
              <Link
                key={s}
                href={buildHref(current, { status: s })}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  status === s
                    ? "bg-gradient-to-b from-teal-500/25 to-teal-600/15 text-teal-100 shadow-sm ring-1 ring-teal-500/30"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {LEAD_STATUS_LABEL[s as LeadStatus]}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {SORT_OPTS.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Sort</span>
          <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-slate-950/80 p-1 shadow-inner shadow-black/40">
            {SORT_OPTS.map((o) => (
              <Link
                key={o.key}
                href={buildHref(current, { sort: o.key })}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeSort === o.key
                    ? "bg-gradient-to-b from-teal-500/25 to-teal-600/15 text-teal-100 shadow-sm ring-1 ring-teal-500/30"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {o.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
