"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Label } from "@meals/components/ui/label";
import { cn } from "@meals/lib/utils";

function piecesFrom(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeTags(current: string[], pieces: string[]) {
  const seen = new Set(current.map((item) => item.toLowerCase()));
  const next = [...current];
  for (const piece of pieces) {
    const key = piece.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(piece);
  }
  return next;
}

export function TagListField({
  name,
  label,
  initial = [],
  placeholder = "Add new",
  className,
  onChange,
}: {
  name?: string;
  label: string;
  initial?: string[];
  placeholder?: string;
  className?: string;
  onChange?: (items: string[]) => void;
}) {
  const [items, setItems] = useState(() =>
    initial.map((s) => s.trim()).filter(Boolean),
  );
  const [draft, setDraft] = useState("");

  function commit(next: string[]) {
    setItems(next);
    onChange?.(next);
  }

  function addFrom(raw: string) {
    const pieces = piecesFrom(raw);
    if (!pieces.length) {
      setDraft("");
      return;
    }
    const next = mergeTags(items, pieces);
    if (next.length !== items.length) commit(next);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addFrom(draft);
      return;
    }
    if (e.key === "Backspace" && draft === "" && items.length > 0) {
      commit(items.slice(0, -1));
    }
  }

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      {name ? <input type="hidden" name={name} value={items.join(", ")} /> : null}
      <Label className="text-xs leading-tight">{label}</Label>
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-xl border border-input bg-background px-1.5 py-1">
        {items.map((item) => (
          <span
            key={item.toLowerCase()}
            className="inline-flex max-w-full items-center gap-0.5 rounded-md bg-primary/12 py-0.5 pl-1.5 pr-0.5 text-[11px] font-medium leading-tight text-foreground"
          >
            <span className="truncate">{item}</span>
            <button
              type="button"
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-background/80 hover:text-foreground"
              aria-label={`Remove ${item}`}
              onClick={() =>
                commit(items.filter((entry) => entry !== item))
              }
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => addFrom(draft)}
          placeholder={placeholder}
          autoComplete="off"
          aria-label={`Add ${label.toLowerCase()}`}
          className="min-h-6 min-w-[4.75rem] flex-1 border-0 bg-transparent px-1 text-xs text-foreground shadow-none outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
