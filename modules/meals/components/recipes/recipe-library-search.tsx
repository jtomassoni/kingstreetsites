"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@meals/components/ui/button";
import { Input } from "@meals/components/ui/input";
import { cn } from "@meals/lib/utils";

const MIN_QUERY = 3;
const SEARCH_ID = "recipe-library-search";

function recipesListHref({ q, liked }: { q?: string; liked?: boolean }) {
  const params = new URLSearchParams();
  const query = q?.trim();
  if (query) params.set("q", query);
  if (liked) params.set("liked", "1");
  const qs = params.toString();
  return qs ? `/tools/meals/recipes?${qs}` : "/tools/meals/recipes";
}

function activeQuery(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= MIN_QUERY ? trimmed : "";
}

export function RecipeLibrarySearch({
  initialQuery = "",
  likedOnly = false,
}: {
  initialQuery?: string;
  likedOnly?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const input = document.getElementById(SEARCH_ID);
    if (input && document.activeElement === input) return;
    setValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const next = activeQuery(value);
    const current = activeQuery(initialQuery);
    if (next === current) return;

    const timer = window.setTimeout(() => {
      router.replace(recipesListHref({ q: next, liked: likedOnly }));
    }, 150);

    return () => window.clearTimeout(timer);
  }, [value, initialQuery, likedOnly, router]);

  return (
    <form
      className="flex w-full min-w-0 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const next = activeQuery(valueRef.current);
        router.replace(recipesListHref({ q: next, liked: likedOnly }));
      }}
    >
      <Input
        id={SEARCH_ID}
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search recipes"
        autoComplete="off"
        className="min-h-11 min-w-0 flex-1 rounded-xl bg-card text-base sm:h-9 sm:min-h-0 sm:rounded-lg sm:py-1.5 sm:text-sm"
      />
      <Button
        asChild
        variant={likedOnly ? "default" : "outline"}
        size="icon"
        className="size-11 shrink-0 rounded-xl sm:size-9 sm:rounded-lg"
      >
        <Link
          href={recipesListHref({ q: activeQuery(initialQuery), liked: !likedOnly })}
          aria-pressed={likedOnly}
          aria-label={likedOnly ? "Show all recipes" : "Show liked recipes"}
        >
          <Heart
            className={cn("size-4", likedOnly && "fill-current")}
            aria-hidden
          />
        </Link>
      </Button>
    </form>
  );
}
