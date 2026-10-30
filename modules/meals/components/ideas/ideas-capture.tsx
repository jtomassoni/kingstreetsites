"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  captureIdea,
  listRecentIdeas,
  type CapturedIdea,
  type SimilarRecipeHit,
} from "@meals/actions/ideas";
import {
  IdeasEmptyArt,
  IdeasHeroArt,
} from "@meals/components/ideas/ideas-art";
import { Button } from "@meals/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@meals/components/ui/dialog";
import { Input } from "@meals/components/ui/input";
import {
  classifyAiError,
  type AiErrorKind,
  type ClassifiedAiError,
} from "@meals/lib/ai/errors";
import { cn } from "@meals/lib/utils";

type CaptureMode = "idle" | "lookup" | "draft";

type ProgressStep = { at: number; label: string; pct: number };

const LOOKUP_STEPS: ProgressStep[] = [
  { at: 0, label: "Searching your recipes…", pct: 14 },
  { at: 900, label: "Looking for a close match…", pct: 36 },
  { at: 2400, label: "Drafting a baseline…", pct: 62 },
  { at: 7000, label: "Almost ready…", pct: 84 },
  { at: 14000, label: "Still working — hang tight…", pct: 91 },
];

const DRAFT_STEPS: ProgressStep[] = [
  { at: 0, label: "Drafting recipe…", pct: 16 },
  { at: 1400, label: "Filling ingredients & steps…", pct: 48 },
  { at: 4500, label: "Saving to your book…", pct: 74 },
  { at: 10000, label: "Almost ready…", pct: 88 },
  { at: 16000, label: "Still working — hang tight…", pct: 92 },
];

type IdeaLogEntry = {
  id: string;
  at: Date;
  idea?: string;
  kind: AiErrorKind | "info";
  title: string;
  message: string;
  detail?: string;
};

function logTone(kind: IdeaLogEntry["kind"]) {
  switch (kind) {
    case "billing":
      return "border-amber-600/30 bg-amber-50 text-amber-950";
    case "network":
      return "border-sky-700/25 bg-sky-50 text-sky-950";
    case "rate_limit":
      return "border-orange-600/30 bg-orange-50 text-orange-950";
    case "auth":
    case "not_configured":
      return "border-rose-700/25 bg-rose-50 text-rose-950";
    case "unfamiliar":
      return "border-border bg-muted/50 text-foreground";
    case "validation":
      return "border-border bg-muted/50 text-foreground";
    default:
      return "border-border bg-card text-foreground";
  }
}

function toLogEntry(
  idea: string,
  error: string,
  errorKind?: AiErrorKind,
): IdeaLogEntry {
  const classified: ClassifiedAiError = classifyAiError(error);
  const kind = errorKind ?? classified.kind;
  const sep = error.indexOf(": ");
  const titled = sep > 0 ? error.slice(0, sep) : null;
  const rest = sep > 0 ? error.slice(sep + 2) : null;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date(),
    idea,
    kind,
    title: titled && titled.length < 40 ? titled : classified.title,
    message: rest && rest.length > 0 ? rest : classified.message,
  };
}

function formatMealTypes(types: string[]) {
  if (!types.length) return null;
  return types
    .map((t) => t.replaceAll("_", " "))
    .slice(0, 2)
    .join(" · ");
}

function mealAccentClass(types: string[]) {
  const primary = types[0];
  if (
    primary === "breakfast" ||
    primary === "lunch" ||
    primary === "dinner" ||
    primary === "snack_prep"
  ) {
    return `ideas-recent-row--${primary}`;
  }
  return null;
}

export function IdeasCapture({ aiEnabled }: { aiEnabled: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputReady, setInputReady] = useState(false);
  const [idea, setIdea] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [logs, setLogs] = useState<IdeaLogEntry[]>([]);
  const [recent, setRecent] = useState<CapturedIdea[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const [pending, start] = useTransition();
  const [loadingRecent, startLoadRecent] = useTransition();
  const [captureMode, setCaptureMode] = useState<CaptureMode>("idle");
  const [progressPct, setProgressPct] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState("");
  const [similarOpen, setSimilarOpen] = useState(false);
  const [pendingIdea, setPendingIdea] = useState("");
  const [similar, setSimilar] = useState<SimilarRecipeHit[]>([]);

  useEffect(() => {
    // Defer the real input until after hydration — mobile Chrome autofill
    // can mutate attributes before React attaches and trigger mismatches.
    setInputReady(true);
  }, []);

  function toggleRecent() {
    if (showRecent) {
      setShowRecent(false);
      return;
    }
    setShowRecent(true);
    if (recentLoaded) return;
    startLoadRecent(async () => {
      try {
        const items = await listRecentIdeas(20);
        setRecent(items);
        setRecentLoaded(true);
      } catch {
        toast.error("Couldn’t load recent ideas");
        setShowRecent(false);
      }
    });
  }

  useEffect(() => {
    if (captureMode === "idle") {
      setProgressPct(0);
      setPhaseLabel("");
      return;
    }

    const steps = captureMode === "draft" ? DRAFT_STEPS : LOOKUP_STEPS;
    setPhaseLabel(steps[0]!.label);
    setProgressPct(steps[0]!.pct);

    const timers = steps.slice(1).map((step) =>
      window.setTimeout(() => {
        setPhaseLabel(step.label);
        setProgressPct(step.pct);
      }, step.at),
    );

    const crawl = window.setInterval(() => {
      setProgressPct((pct) => (pct < 94 ? Math.min(94, pct + 0.6) : pct));
    }, 700);

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.clearInterval(crawl);
    };
  }, [captureMode]);

  useEffect(() => {
    if (!pending && captureMode !== "idle") {
      setProgressPct(100);
      const done = window.setTimeout(() => setCaptureMode("idle"), 220);
      return () => window.clearTimeout(done);
    }
  }, [pending, captureMode]);

  function remember(
    recipe: {
      id: string;
      title: string;
      mealTypes: string[];
      createdAt: string;
    },
    source: CapturedIdea["source"],
    needsReview?: boolean,
  ) {
    const next: CapturedIdea = {
      id: recipe.id,
      title: recipe.title,
      source,
      mealTypes: recipe.mealTypes,
      createdAt: recipe.createdAt,
      needsReview,
    };
    setRecent((prev) =>
      [next, ...prev.filter((r) => r.id !== next.id)].slice(0, 20),
    );
  }

  function finishCreated(
    result: Extract<
      Awaited<ReturnType<typeof captureIdea>>,
      { success: true; kind: "created" | "reused" }
    >,
  ) {
    const { recipe, source, message, kind } = result;
    remember(recipe, source, kind === "created");
    setIdea("");
    setPendingIdea("");
    setSimilar([]);
    setSimilarOpen(false);
    setStatus(
      kind === "reused"
        ? `In library · ${recipe.title}`
        : `Drafted · ${recipe.title}`,
    );
    toast.success(message, {
      action:
        kind === "created"
          ? {
              label: "Edit",
              onClick: () => router.push(`/tools/meals/recipes/${recipe.id}/edit`),
            }
          : {
              label: "View",
              onClick: () => router.push(`/tools/meals/recipes/${recipe.id}`),
            },
    });
    router.refresh();
  }

  function submit(opts?: { forceCreate?: boolean; useRecipeId?: string }) {
    const value = (
      opts?.forceCreate || opts?.useRecipeId ? pendingIdea : idea
    ).trim();
    if (value.length < 2 || pending) return;

    const mode: CaptureMode =
      opts?.forceCreate || opts?.useRecipeId ? "draft" : "lookup";
    setCaptureMode(mode);
    setStatus(null);
    start(async () => {
      try {
        const result = await captureIdea({
          idea: value,
          forceCreate: opts?.forceCreate,
          useRecipeId: opts?.useRecipeId,
        });
        if (!result.success) {
          const entry = toLogEntry(value, result.error, result.errorKind);
          setLogs((prev) => [entry, ...prev].slice(0, 8));
          setCaptureMode("idle");
          setStatus(`${entry.title} — see note below`);
          toast.error(entry.title, { description: entry.message });
          return;
        }
        if (result.kind === "similar") {
          setPendingIdea(result.idea);
          setSimilar(result.similar);
          setSimilarOpen(true);
          setCaptureMode("idle");
          setStatus(null);
          return;
        }
        finishCreated(result);
      } catch (err) {
        const classified = classifyAiError(err);
        const entry: IdeaLogEntry = {
          id: `${Date.now()}-net`,
          at: new Date(),
          idea: value,
          kind: classified.kind,
          title: classified.title,
          message: classified.message,
          detail: classified.detail,
        };
        setLogs((prev) => [entry, ...prev].slice(0, 8));
        setCaptureMode("idle");
        setStatus(`${entry.title} — see note below`);
        toast.error(entry.title, { description: entry.message });
      }
    });
  }

  return (
    <div className="ideas-page mx-auto w-full max-w-lg space-y-3 md:space-y-5 md:pt-4">
      <div className="ideas-ambient" aria-hidden />

      <header className="ideas-hero">
        <div className="ideas-hero-copy">
          <h1 className="font-display font-semibold tracking-tight text-primary">
            Ideas
          </h1>
          <p className="ideas-hero-lede">
            Name a dish — we’ll match your library or draft one
            {aiEnabled ? "" : " (AI off)"}.
          </p>
          <p className="ideas-hero-detail">
            Real dishes only in the generator — drinks and mashups stay out.
            Anything else can still be added by hand in Recipes
            {aiEnabled ? "" : " (stub recipes while AI is off)"}.
          </p>
        </div>
        <IdeasHeroArt className="ideas-hero-art" />
      </header>

      <form
        className="ideas-form"
        suppressHydrationWarning
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="idea-input" className="sr-only">
          Add an idea
        </label>
        <div className="flex items-stretch gap-2">
          {inputReady ? (
            <Input
              ref={inputRef}
              id="idea-input"
              name="meal-idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Add an idea"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={pending}
              className="min-h-11 min-w-0 flex-1 border-border/80 bg-background/70 px-3 text-base shadow-none placeholder:text-muted-foreground/70 md:min-h-12"
            />
          ) : (
            <div
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-border/80 bg-background/70 md:min-h-12"
              aria-hidden
            />
          )}
          <Button
            type="submit"
            disabled={pending || idea.trim().length < 2}
            className="min-h-11 shrink-0 px-4 text-base md:min-h-12"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              "Add"
            )}
          </Button>
        </div>

        {pending || captureMode !== "idle" ? (
          <div
            className="space-y-2 rounded-xl border border-border/70 bg-background/50 px-3 py-3"
            aria-live="polite"
            aria-busy={pending}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{phaseLabel}</p>
              <span className="tabular-nums text-xs text-muted-foreground">
                {Math.round(progressPct)}%
              </span>
            </div>
            <div
              className="idea-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressPct)}
              aria-label={phaseLabel || "Capture progress"}
            >
              <div
                className="idea-progress-fill"
                style={{ width: `${Math.max(progressPct, 4)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {captureMode === "draft"
                ? "Building a recipe you can edit next."
                : "Checking your library first, then drafting if needed."}
            </p>
          </div>
        ) : status ? (
          <p
            className="text-center text-sm text-muted-foreground"
            aria-live="polite"
          >
            {status}
          </p>
        ) : null}
      </form>

      {logs.length > 0 ? (
        <section
          className="space-y-2"
          aria-label="Capture notes"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Notes
            </h2>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => setLogs([])}
            >
              Clear
            </button>
          </div>
          <ul className="space-y-2">
            {logs.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-sm",
                  logTone(entry.kind),
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <p className="font-medium">{entry.title}</p>
                  <time
                    className="text-[11px] opacity-70"
                    dateTime={entry.at.toISOString()}
                  >
                    {entry.at.toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                {entry.idea ? (
                  <p className="mt-0.5 text-xs opacity-80">
                    Idea: “{entry.idea}”
                  </p>
                ) : null}
                <p className="mt-1 text-[13px] leading-snug opacity-95">
                  {entry.message}
                </p>
                {entry.kind === "billing" ? (
                  <p className="mt-1.5 text-[11px] leading-snug opacity-80">
                    OpenAI billing: platform.openai.com → Settings → Billing
                  </p>
                ) : null}
                {entry.kind === "network" ? (
                  <p className="mt-1.5 text-[11px] leading-snug opacity-80">
                    If you’re on VPN or flaky Wi‑Fi, reconnect and retry.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showRecent ? (
        <section className="space-y-3" aria-label="Recent ideas">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent
            </h2>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={toggleRecent}
            >
              Hide
            </button>
          </div>
          {loadingRecent && !recentLoaded ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : recent.length === 0 ? (
            <div className="ideas-empty">
              <IdeasEmptyArt className="ideas-empty-art" />
              <div className="space-y-1">
                <p className="font-display text-base font-semibold text-foreground">
                  Nothing recent yet
                </p>
                <p className="text-sm text-muted-foreground">
                  Capture a dish above and it’ll show up here.
                </p>
              </div>
            </div>
          ) : (
            <ul className="ideas-recent-list">
              {recent.map((item) => {
                const mealTypes = formatMealTypes(item.mealTypes);
                return (
                  <li key={item.id}>
                    <Link
                      href={
                        item.needsReview
                          ? `/tools/meals/recipes/${item.id}/edit`
                          : `/tools/meals/recipes/${item.id}`
                      }
                      className={cn(
                        "ideas-recent-row",
                        mealAccentClass(item.mealTypes),
                      )}
                    >
                      <span className="ideas-recent-mark" aria-hidden>
                        {item.title.trim().charAt(0).toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.title}</p>
                        {mealTypes ? (
                          <p className="text-xs text-muted-foreground">
                            {mealTypes}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-medium",
                          item.needsReview
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      >
                        {item.needsReview ? "Edit" : "View"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <button
          type="button"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 bg-card/50 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
          aria-expanded={false}
          onClick={toggleRecent}
          disabled={loadingRecent}
        >
          {loadingRecent ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Loading recent…
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5" aria-hidden />
              Show recent
            </>
          )}
        </button>
      )}

      <Dialog open={similarOpen} onOpenChange={setSimilarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Something similar is already in your book</DialogTitle>
            <DialogDescription>
              {similar.length === 1
                ? `You already have “${similar[0]?.title}”. Still add a new recipe for “${pendingIdea}”?`
                : `You already have similar recipes. Still add a new recipe for “${pendingIdea}”?`}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {similar.map((hit) => (
              <li key={hit.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 w-full justify-start py-2 text-left"
                  disabled={pending}
                  onClick={() => submit({ useRecipeId: hit.id })}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {hit.title}
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      Use this recipe
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setSimilarOpen(false);
                setStatus(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => submit({ forceCreate: true })}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Drafting…
                </>
              ) : (
                "Add new recipe anyway"
              )}
            </Button>
          </DialogFooter>
          {pending && captureMode === "draft" ? (
            <div className="space-y-1.5" aria-live="polite">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{phaseLabel}</p>
                <span className="tabular-nums text-[11px] text-muted-foreground">
                  {Math.round(progressPct)}%
                </span>
              </div>
              <div
                className="idea-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressPct)}
                aria-label={phaseLabel || "Draft progress"}
              >
                <div
                  className="idea-progress-fill"
                  style={{ width: `${Math.max(progressPct, 4)}%` }}
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
