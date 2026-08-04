/** Shared CRM layout + surface primitives. */

export const crm = {
  /** Page shell */
  pageTitle: "text-[1.75rem] font-semibold leading-tight tracking-tight text-crm-text",
  pageLead: "mt-1 max-w-2xl text-[0.9375rem] leading-relaxed text-crm-muted",

  /** Record detail (single lead / customer) */
  recordHeader:
    "mb-6 border-b border-crm-border pb-5",
  recordTitle: "text-[1.375rem] font-semibold leading-snug tracking-tight text-crm-text",
  recordMeta: "mt-1 text-sm text-crm-muted",
  recordActions: "flex flex-wrap items-center gap-2",

  /** Two-column work layout: sidebar left, timeline/main right */
  workGrid: "grid gap-6 lg:grid-cols-[min(100%,20rem)_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]",
  workMain: "min-w-0 lg:col-start-2 lg:row-start-1",
  workSidebar: "min-w-0 space-y-4 lg:col-start-1 lg:row-start-1 lg:sticky lg:top-[4.5rem] lg:self-start",

  /** Surfaces */
  panel: "overflow-hidden rounded-xl border border-crm-border bg-crm-surface",
  panelHeader: "border-b border-crm-border px-4 py-3",
  panelBody: "p-4",
  panelTitle: "text-sm font-medium text-crm-text",
  panelHint: "text-xs text-crm-faint",

  card: "rounded-xl border border-crm-border bg-crm-surface p-4",
  sectionTitle: "mb-3 text-xs font-medium uppercase tracking-wide text-crm-faint",

  /** Nav tabs — underline style */
  tabs: "flex gap-5 border-b border-crm-border",
  tab: (active: boolean) =>
    active
      ? "relative -mb-px border-b-2 border-crm-accent pb-2.5 text-sm font-medium text-crm-text"
      : "pb-2.5 text-sm font-medium text-crm-muted transition hover:text-crm-text",

  /** Filters / chips */
  pill: (active: boolean) =>
    active
      ? "rounded-full bg-crm-text px-3 py-1 text-xs font-medium text-crm-bg"
      : "rounded-full px-3 py-1 text-xs font-medium text-crm-muted transition hover:bg-crm-raised hover:text-crm-text",

  /** Form */
  field: "space-y-1.5",
  fieldLabel: "block text-xs font-medium text-crm-muted",
  input:
    "w-full rounded-lg border border-crm-border bg-crm-bg px-3 py-2 text-sm text-crm-text outline-none transition placeholder:text-crm-faint focus:border-crm-accent/60 focus:ring-2 focus:ring-crm-accent/15",
  btn:
    "inline-flex items-center justify-center rounded-lg border border-crm-border bg-crm-raised px-3 py-2 text-sm font-medium text-crm-text transition hover:bg-crm-border/50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-crm-raised",
  btnPrimary:
    "inline-flex items-center justify-center rounded-lg bg-crm-text px-3 py-2 text-sm font-medium text-crm-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-crm-raised disabled:text-crm-faint disabled:opacity-100 disabled:hover:opacity-100",
  btnGhost: "text-sm font-medium text-crm-muted transition hover:text-crm-text",
  formActions: "flex flex-wrap items-center gap-2 pt-1",

  /** List rows */
  list: "divide-y divide-crm-border overflow-hidden rounded-xl border border-crm-border bg-crm-surface",
  listRow:
    "flex flex-col gap-3 px-4 py-3.5 transition hover:bg-crm-raised/50 sm:flex-row sm:items-center sm:gap-4",

  /** Misc */
  link: "font-medium text-crm-accent hover:text-crm-accent-hover underline-offset-2 hover:underline",
  metaRow: "flex items-baseline justify-between gap-3 text-sm",
  metaLabel: "shrink-0 text-crm-faint",
  metaValue: "min-w-0 text-right text-crm-text",

  badge: (tone: "neutral" | "good" | "warn" | "bad" = "neutral") => {
    const tones = {
      neutral: "bg-crm-raised text-crm-muted",
      good: "bg-emerald-500/10 text-emerald-400",
      warn: "bg-amber-500/10 text-amber-400",
      bad: "bg-red-500/10 text-red-400",
    };
    return `inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`;
  },

  /** Modals */
  modalBackdrop: "fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6",
  modalOverlay: "absolute inset-0 bg-black/60 backdrop-blur-sm",
  modalPanel: "relative flex max-h-[min(90vh,48rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-crm-border bg-crm-surface shadow-2xl",
  modalPanelWide: "relative flex max-h-[min(90vh,48rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-crm-border bg-crm-surface shadow-2xl",
  modalHeader: "shrink-0 border-b border-crm-border px-5 py-4",
  modalBody: "flex-1 overflow-y-auto px-5 py-4",
  modalFooter:
    "shrink-0 flex flex-col-reverse gap-2 border-t border-crm-border px-5 py-4 sm:flex-row sm:justify-end",

  /** Stats */
  statGrid: "mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4",
  statTile: "flex min-h-[4.5rem] flex-col rounded-lg border border-crm-border bg-crm-surface p-3 sm:min-h-[5rem]",
  statLabel: "text-xs text-crm-faint",
  statValue: "mt-1 text-xl font-semibold tabular-nums tracking-tight text-crm-text",
  statHint: "mt-auto pt-2 text-xs leading-snug text-crm-faint",

  /** Pipeline tool cards */
  toolCard: "flex min-h-[240px] w-full flex-col gap-3 rounded-xl border border-crm-border bg-crm-surface p-4 sm:min-h-[252px]",
} as const;

function gradeTone(grade: string | null | undefined): "good" | "warn" | "bad" | "neutral" {
  if (grade === "F") return "bad";
  if (grade === "C") return "warn";
  if (grade === "A") return "good";
  return "neutral";
}

function tierTone(tier: string | null | undefined): "good" | "warn" | "bad" | "neutral" {
  if (tier === "reject") return "bad";
  if (tier === "A") return "good";
  if (tier === "B") return "warn";
  return "neutral";
}

function invoiceStatusTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "paid") return "good";
  if (status === "overdue") return "bad";
  if (status === "sent") return "warn";
  if (status === "void") return "neutral";
  return "neutral";
}

export { gradeTone, tierTone, invoiceStatusTone };
