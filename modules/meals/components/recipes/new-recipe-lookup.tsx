"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  confirmImportRecipe,
  lookupRecipeByQuery,
  type RecipeLookupCandidate,
  type SimilarRecipeHit,
} from "@meals/actions/catalog-recipes";
import { Button } from "@meals/components/ui/button";
import { Input } from "@meals/components/ui/input";
import { Label } from "@meals/components/ui/label";

const SUGGESTIONS = [
  "chicken alfredo",
  "birria tacos",
  "sheet pan salmon",
  "turkey chili",
] as const;

export function NewRecipeLookup() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [candidates, setCandidates] = useState<RecipeLookupCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [similar, setSimilar] = useState<SimilarRecipeHit[]>([]);
  const [pendingQuery, setPendingQuery] = useState("");

  const selected =
    candidates.find((c) => c.id === selectedId) ?? candidates[0] ?? null;

  function runLookup(value: string) {
    const q = value.trim();
    if (q.length < 2) return;
    start(async () => {
      setError(null);
      setExisting(null);
      setSimilar([]);
      setCandidates([]);
      setSelectedId(null);
      setPendingQuery(q);
      const result = await lookupRecipeByQuery(q);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.existing) {
        setExisting(result.existing);
        return;
      }
      if (result.similar?.length) {
        setSimilar(result.similar);
        return;
      }
      const list = result.candidates ?? [];
      setCandidates(list);
      setSelectedId(list[0]?.id ?? null);
    });
  }

  function saveDraft(candidate: RecipeLookupCandidate) {
    start(async () => {
      const { source, ...recipe } = candidate;
      const result = await confirmImportRecipe({ recipe, source });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.alreadyExisted
          ? `${result.title} is already in your book`
          : `Added ${result.title} — tweak it if you want`,
      );
      if (result.recipeId) {
        router.push(`/tools/meals/recipes/${result.recipeId}/edit`);
      } else {
        router.push("/tools/meals/recipes");
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="recipe-query">What dish do you want?</Label>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            runLookup(query);
          }}
        >
          <Input
            id="recipe-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. birria tacos, pad thai"
            className="min-h-11 flex-1"
            autoFocus
          />
          <Button type="submit" disabled={pending || query.trim().length < 2}>
            {pending ? "Drafting…" : "Draft recipe"}
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuery(s);
                runLookup(s);
              }}
              className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-accent"
            >
              {s}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          We check your library first, then draft a practical baseline you can
          edit before it goes in the book.
        </p>
      </div>

      {error ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border bg-card/50 px-4 py-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button asChild variant="outline">
            <Link href="/tools/meals/recipes/new/manual">Enter manually instead</Link>
          </Button>
        </div>
      ) : null}

      {existing ? (
        <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
          <p className="text-sm">
            <span className="font-medium">{existing.title}</span> is already in
            your recipe book.
          </p>
          <Button asChild>
            <Link href={`/tools/meals/recipes/${existing.id}`}>Open recipe</Link>
          </Button>
        </div>
      ) : null}

      {similar.length ? (
        <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
          <p className="text-sm">
            Hey, there&apos;s something similar. Still add a new recipe for{" "}
            <span className="font-medium">“{pendingQuery}”</span>?
          </p>
          <ul className="space-y-2">
            {similar.map((hit) => (
              <li key={hit.id}>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href={`/tools/meals/recipes/${hit.id}`}>Use “{hit.title}”</Link>
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setSimilar([]);
              start(async () => {
                const generated = await lookupRecipeByQuery(pendingQuery, {
                  forceCreate: true,
                });
                if (generated.error) {
                  setError(generated.error);
                  return;
                }
                const list = generated.candidates ?? [];
                setCandidates(list);
                setSelectedId(list[0]?.id ?? null);
              });
            }}
          >
            {pending ? "Drafting…" : "Add new recipe anyway"}
          </Button>
        </div>
      ) : null}

      {candidates.length > 1 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Pick a match</p>
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                    selected?.id === c.id
                      ? "border-primary bg-accent"
                      : "border-border bg-card hover:bg-accent/50"
                  }`}
                >
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {[c.cuisine, c.source === "ai" ? "Baseline draft" : "Quick draft"]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selected ? (
        <div className="space-y-4 rounded-xl border border-border bg-card px-4 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold">{selected.title}</h2>
            <p className="text-sm text-muted-foreground">
              {[
                selected.cuisine,
                `${selected.defaultServings} servings`,
                selected.source === "ai" ? "Baseline draft" : "Quick draft",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {selected.description ? (
              <p className="mt-2 text-sm">{selected.description}</p>
            ) : null}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Ingredients</h3>
            <ul className="space-y-1 text-sm">
              {selected.ingredients.map((ing, i) => (
                <li key={`${ing.ingredientName}-${i}`}>
                  {[
                    ing.quantity != null ? String(ing.quantity) : null,
                    ing.unit,
                    ing.ingredientName,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Steps</h3>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {selected.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>

          <p className="text-sm font-medium">Does this look okay as a starting point?</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => saveDraft(selected)}
            >
              {pending ? "Adding…" : "Yes, add then edit"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setCandidates([]);
                setSelectedId(null);
                setError(null);
              }}
            >
              No, try another
            </Button>
            <Button asChild variant="ghost">
              <Link href="/tools/meals/recipes/new/manual">Enter manually</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {!selected && !existing && !error && !similar.length ? (
        <p className="text-sm text-muted-foreground">
          Family recipes that aren&apos;t online?{" "}
          <Link
            href="/tools/meals/recipes/new/manual"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Enter one manually
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
