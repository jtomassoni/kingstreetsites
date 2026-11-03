"use client";

import { useEffect, useId, useRef, useState } from "react";

export type MenuSelectOption = { value: string; label: string };

/** In-page select — avoids macOS native option menus that ignore font-size. */
export function MenuSelect({
  value,
  onChange,
  options,
  disabled,
  className,
  buttonClassName,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: MenuSelectOption[];
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        className={
          buttonClassName ??
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-ink/10 bg-cream px-3 text-sm text-ink disabled:opacity-50"
        }
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <svg
          className="size-3.5 shrink-0 text-ink-faint"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path
            d="M4 6.5 8 10.5 12 6.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-ink/10 bg-white py-1 text-sm shadow-lg shadow-ink/10"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`block w-full px-3 py-2.5 text-left text-sm ${
                    active
                      ? "bg-brand/10 font-medium text-brand-dark"
                      : "text-ink hover:bg-cream"
                  }`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
