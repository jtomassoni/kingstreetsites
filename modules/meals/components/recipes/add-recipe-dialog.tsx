"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, PenLine, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateRecipeForIdea } from "@meals/actions/ai";
import { Button } from "@meals/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@meals/components/ui/dialog";
import { Input } from "@meals/components/ui/input";
import { Label } from "@meals/components/ui/label";
import { cn } from "@meals/lib/utils";

const IDEA_SUGGESTIONS = [
  "chicken alfredo",
  "paella",
  "sheet pan salmon",
  "turkey chili",
  "homemade pizza",
] as const;

type SimilarRecipe = { id: string; title: string };

function SuggestionChip({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-xl border px-3 py-1.5 text-sm transition-colors disabled:opacity-50",
        selected
          ? "border-primary bg-primary/15 font-medium text-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function AddRecipeDialog({
  aiEnabled,
  triggerClassName,
}: {
  aiEnabled: boolean;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [idea, setIdea] = useState("");
  const [ideaNotes, setIdeaNotes] = useState("");
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similar, setSimilar] = useState<SimilarRecipe[]>([]);

  function resetSoft() {
    setIdea("");
    setIdeaNotes("");
    setSimilar([]);
    setSimilarOpen(false);
  }

  function finishWithRecipe(recipeId: string, message?: string) {
    if (message) toast.success(message);
    setOpen(false);
    resetSoft();
    router.push(`/tools/meals/recipes/${recipeId}`);
  }

  function submit(opts?: { forceCreate?: boolean; useRecipeId?: string }) {
    if (opts?.useRecipeId) {
      finishWithRecipe(opts.useRecipeId);
      return;
    }

    const value = idea.trim();
    if (!value || pending) return;

    start(async () => {
      const result = await generateRecipeForIdea({
        mealIdea: value,
        notes: ideaNotes.trim() || undefined,
        save: true,
        forceCreate: opts?.forceCreate,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.usedHouseholdRecipe) {
        const first = result.recipes?.[0];
        if (first) {
          toast.message(result.message ?? "Found in your library");
          finishWithRecipe(first.id);
        }
        return;
      }
      if (result.similarRecipes?.length) {
        setSimilar(result.similarRecipes);
        setSimilarOpen(true);
        return;
      }
      const saved = result.saved as
        | { success?: boolean; recipeId?: string; error?: string }
        | undefined;
      if (saved?.error) {
        toast.error(saved.error);
        return;
      }
      toast.success(`Added ${result.recipe?.title ?? "recipe"}`);
      setOpen(false);
      resetSoft();
      if (saved?.recipeId) {
        router.push(`/tools/meals/recipes/${saved.recipeId}`);
      } else {
        router.refresh();
      }
    });
  }

  const canSubmit = idea.trim().length > 0;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetSoft();
        }}
      >
        <DialogTrigger asChild>
          <Button
            className={cn(
              "min-h-11 shrink-0 px-4 text-sm sm:h-9 sm:min-h-0",
              triggerClassName,
            )}
          >
            Add recipe
          </Button>
        </DialogTrigger>
        <DialogContent className="flex max-h-[min(90dvh,40rem)] max-w-md flex-col gap-0 overflow-hidden p-0 max-sm:top-auto max-sm:bottom-3 max-sm:max-h-[min(88dvh,40rem)] max-sm:translate-y-0 max-sm:rounded-2xl sm:max-w-md sm:p-0">
          <DialogHeader className="shrink-0 border-b border-border/70 px-4 py-4 text-left sm:px-6 sm:py-5">
            <DialogTitle className="font-display text-xl leading-snug">
              Add a recipe
            </DialogTitle>
            <DialogDescription className="text-pretty leading-relaxed">
              {aiEnabled
                ? "Name a dish — we'll check your library first, then draft if needed."
                : "Enter a recipe by hand. AI draft is off until OPENAI_API_KEY is set."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            {aiEnabled ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="add-idea" className="text-sm font-medium">
                    What do you want to make?
                  </Label>
                  <Input
                    id="add-idea"
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder="e.g. chicken alfredo"
                    className="min-h-12 bg-card text-base"
                    disabled={pending}
                    enterKeyHint="go"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSubmit && !pending) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tap a suggestion or type your own dish name.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {IDEA_SUGGESTIONS.map((s) => (
                      <SuggestionChip
                        key={s}
                        label={s}
                        selected={idea.trim().toLowerCase() === s.toLowerCase()}
                        disabled={pending}
                        onClick={() => setIdea(s)}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-idea-notes" className="text-sm font-medium">
                    Notes{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="add-idea-notes"
                    value={ideaNotes}
                    onChange={(e) => setIdeaNotes(e.target.value)}
                    placeholder="extra garlic, no mushrooms…"
                    className="min-h-12 bg-card text-base"
                    disabled={pending}
                  />
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 px-3.5 py-3.5 text-sm leading-relaxed text-muted-foreground">
                Enter the recipe details manually below.
              </p>
            )}
          </div>

          <div className="shrink-0 space-y-3 border-t border-border/70 bg-background/95 px-4 py-4 backdrop-blur-sm sm:px-6">
            {aiEnabled ? (
              <Button
                type="button"
                size="lg"
                className="w-full gap-2 text-base font-semibold shadow-sm"
                disabled={pending || !canSubmit}
                onClick={() => submit()}
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Adding…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" aria-hidden />
                    Generate & save
                  </>
                )}
              </Button>
            ) : null}

            <div className="space-y-2">
              {aiEnabled ? (
                <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Or enter by hand
                </p>
              ) : null}
              <Button
                asChild
                variant="outline"
                className="min-h-11 w-full gap-1.5 text-sm"
                disabled={pending}
              >
                <Link href="/tools/meals/recipes/new/manual" onClick={() => setOpen(false)}>
                  <PenLine className="size-3.5 shrink-0" aria-hidden />
                  Enter manually
                </Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={similarOpen} onOpenChange={setSimilarOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Something similar is already in your book</DialogTitle>
            <DialogDescription>
              {similar.length === 1
                ? `You already have “${similar[0]?.title}”. Still generate a new recipe for “${idea.trim()}”?`
                : `You already have similar recipes. Still generate a new recipe for “${idea.trim()}”?`}
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
                    <span className="block truncate font-medium">{hit.title}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      Use this recipe
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setSimilarOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setSimilarOpen(false);
                submit({ forceCreate: true });
              }}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Generating…
                </>
              ) : (
                "Generate new recipe anyway"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
