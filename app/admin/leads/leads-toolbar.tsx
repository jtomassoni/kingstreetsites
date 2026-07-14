import Link from "next/link";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/lead-status";
import type { PeopleView } from "./data";
import { crm } from "@/lib/admin-ui";

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
          { key: "grade", label: "Worst sites" },
          { key: "opportunity", label: "Best targets" },
          { key: "newest", label: "Newest" },
          { key: "pending", label: "Needs analysis" },
        ];
  const hasFilters = Boolean(q?.trim() || (view === "leads" && status) || tier);

  return (
    <div className="mb-5 space-y-4">
      <form method="get" action="/admin/leads" className="flex flex-wrap items-center gap-2">
        {view === "customers" ? <input type="hidden" name="view" value="customers" /> : null}
        {activeSort !== defaultSort(view) ? <input type="hidden" name="sort" value={activeSort} /> : null}
        {view === "leads" && status ? <input type="hidden" name="status" value={status} /> : null}
        {tier ? <input type="hidden" name="tier" value={tier} /> : null}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder={view === "customers" ? "Search customers…" : "Search leads…"}
          className={`${crm.input} max-w-md flex-1`}
        />
        <button type="submit" className={crm.btn}>
          Search
        </button>
        {hasFilters ? (
          <Link
            href={buildHref({ view, sort: activeSort }, { q: undefined, status: undefined, tier: undefined })}
            className={crm.btnGhost}
          >
            Clear filters
          </Link>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {view === "leads" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-crm-faint">Status</span>
            <Link href={buildHref(current, { status: undefined })} className={crm.pill(!status)}>
              All
            </Link>
            {LEAD_STATUS_FILTERS.map((s) => (
              <Link key={s} href={buildHref(current, { status: s })} className={crm.pill(status === s)}>
                {LEAD_STATUS_LABEL[s as LeadStatus]}
              </Link>
            ))}
          </div>
        ) : null}

        {SORT_OPTS.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-crm-faint">Sort</span>
            {SORT_OPTS.map((o) => (
              <Link key={o.key} href={buildHref(current, { sort: o.key })} className={crm.pill(activeSort === o.key)}>
                {o.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
