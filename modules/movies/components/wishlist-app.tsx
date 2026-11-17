"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  addWishlistItemAction,
  markWishlistWatchedAction,
  removeWishlistItemAction,
  restoreWishlistItemAction,
  setWishlistVoteAction,
} from "@movies/actions/wishlist";
import { voterLabel } from "@movies/lib/voters";
import type {
  MovieVote,
  MovieVoter,
  MovieWishlistItem,
} from "@movies/types";

type Props = {
  initialItems: MovieWishlistItem[];
  viewer: MovieVoter | null;
};

export function WishlistApp({ initialItems, viewer }: Props) {
  const [items, setItems] = useState(initialItems);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const wishlist = useMemo(
    () => items.filter((i) => i.status === "wishlist"),
    [items],
  );
  const watched = useMemo(
    () => items.filter((i) => i.status === "watched"),
    [items],
  );

  function upsert(item: MovieWishlistItem) {
    setItems((prev) => {
      const without = prev.filter((i) => i.id !== item.id);
      return [item, ...without];
    });
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await addWishlistItemAction({
        title,
        year: year || null,
        notes: notes || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.item) {
        upsert(res.item);
        setTitle("");
        setYear("");
        setNotes("");
        setMessage(`Added ${res.item.title}`);
      }
    });
  }

  function markWatched(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await markWishlistWatchedAction({ id });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.item) {
        upsert(res.item);
        setMessage(`Marked ${res.item.title} watched — leave a thumbs up or down.`);
      }
    });
  }

  function restore(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await restoreWishlistItemAction({ id });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.item) upsert(res.item);
    });
  }

  function vote(id: string, voter: MovieVoter, next: MovieVote | null) {
    setError(null);
    startTransition(async () => {
      const res = await setWishlistVoteAction({ id, voter, vote: next });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.item) upsert(res.item);
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeWishlistItemAction(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-3 pb-10 pt-2 sm:px-6 sm:pb-12">
      <header className="max-w-2xl">
        <h1 className="font-serif text-[1.85rem] leading-tight tracking-tight text-ink sm:text-5xl">
          Movie wishlist
        </h1>
        <p className="mt-2 text-sm text-ink-muted sm:mt-3 sm:text-lg">
          Queue titles to watch. After you see one, James and Mary each leave a
          thumbs up or down.
        </p>
      </header>

      {(error || message) && (
        <div
          className={`mt-4 rounded-xl border px-3 py-2.5 text-sm sm:mt-6 sm:px-4 sm:py-3 ${
            error
              ? "border-accent-rose/30 bg-accent-rose/5 text-accent-rose"
              : "border-brand/25 bg-brand/5 text-brand-dark"
          }`}
          role="status"
        >
          {error || message}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-sm sm:mt-8 sm:p-5">
        <h2 className="font-serif text-xl tracking-tight text-ink sm:text-2xl">
          Add a movie
        </h2>
        <form className="mt-4 space-y-3" onSubmit={onAdd}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="min-w-0 flex-[2]">
              <span className="sr-only">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Movie title"
                required
                className="w-full rounded-xl border border-ink/10 bg-cream px-3.5 py-3 text-base text-ink outline-none ring-brand/30 placeholder:text-ink-faint focus:border-brand/40 focus:ring-2 sm:py-2.5 sm:text-sm"
              />
            </label>
            <label className="sm:w-28">
              <span className="sr-only">Year</span>
              <input
                type="text"
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                placeholder="Year"
                className="w-full rounded-xl border border-ink/10 bg-cream px-3.5 py-3 text-base text-ink outline-none ring-brand/30 placeholder:text-ink-faint focus:border-brand/40 focus:ring-2 sm:py-2.5 sm:text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="sr-only">Notes</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note (where it’s streaming, why we want it…)"
              className="w-full rounded-xl border border-ink/10 bg-cream px-3.5 py-3 text-base text-ink outline-none ring-brand/30 placeholder:text-ink-faint focus:border-brand/40 focus:ring-2 sm:py-2.5 sm:text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pending || title.trim().length === 0}
            className="min-h-11 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50 sm:w-auto"
          >
            {pending ? "Saving…" : "Add to wishlist"}
          </button>
        </form>
      </section>

      <section className="mt-8 sm:mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl tracking-tight text-ink sm:text-2xl">
            Want to watch
          </h2>
          <p className="shrink-0 text-xs text-ink-muted sm:text-sm">
            {wishlist.length === 0 ? "Empty" : `${wishlist.length}`}
          </p>
        </div>
        <ul className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
          {wishlist.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-ink/10 px-4 py-6 text-center text-sm text-ink-muted">
              Nothing queued yet — add a title above.
            </li>
          ) : (
            wishlist.map((item) => (
              <WishlistRow
                key={item.id}
                item={item}
                pending={pending}
                onWatched={() => markWatched(item.id)}
                onRemove={() => remove(item.id)}
              />
            ))
          )}
        </ul>
      </section>

      <section className="mt-8 sm:mt-12">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl tracking-tight text-ink sm:text-2xl">
            Watched
          </h2>
          <p className="shrink-0 text-xs text-ink-muted sm:text-sm">
            {watched.length === 0 ? "None yet" : `${watched.length}`}
          </p>
        </div>
        <ul className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
          {watched.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-ink/10 px-4 py-6 text-center text-sm text-ink-muted">
              After you watch something, mark it watched and rate it.
            </li>
          ) : (
            watched.map((item) => (
              <WatchedRow
                key={item.id}
                item={item}
                viewer={viewer}
                pending={pending}
                onVote={(voter, next) => vote(item.id, voter, next)}
                onRestore={() => restore(item.id)}
                onRemove={() => remove(item.id)}
              />
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function titleLine(item: MovieWishlistItem) {
  return item.year ? `${item.title} (${item.year})` : item.title;
}

function WishlistRow({
  item,
  pending,
  onWatched,
  onRemove,
}: {
  item: MovieWishlistItem;
  pending: boolean;
  onWatched: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-2xl border border-ink/[0.06] bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium leading-snug text-ink sm:text-base">
            {titleLine(item)}
          </p>
          {item.notes ? (
            <p className="mt-0.5 text-xs text-ink-muted sm:text-sm">{item.notes}</p>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={onWatched}
            className="min-h-10 flex-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50 sm:min-h-9 sm:flex-none"
          >
            Watched
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onRemove}
            className="min-h-10 rounded-lg px-3 py-1.5 text-xs font-medium text-accent-rose hover:bg-accent-rose/5 disabled:opacity-50 sm:min-h-9"
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

function WatchedRow({
  item,
  viewer,
  pending,
  onVote,
  onRestore,
  onRemove,
}: {
  item: MovieWishlistItem;
  viewer: MovieVoter | null;
  pending: boolean;
  onVote: (voter: MovieVoter, vote: MovieVote | null) => void;
  onRestore: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-2xl border border-ink/[0.06] bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium leading-snug text-ink sm:text-base">
              {titleLine(item)}
            </p>
            {item.notes ? (
              <p className="mt-0.5 text-xs text-ink-muted sm:text-sm">
                {item.notes}
              </p>
            ) : null}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={pending}
              onClick={onRestore}
              className="min-h-9 rounded-lg border border-ink/10 px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:bg-cream disabled:opacity-50"
            >
              Back to list
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onRemove}
              className="min-h-9 rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent-rose hover:bg-accent-rose/5 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <VoterThumbs
            voter="james"
            vote={item.james_vote}
            isYou={viewer === "james"}
            pending={pending}
            onVote={(next) => onVote("james", next)}
          />
          <VoterThumbs
            voter="mary"
            vote={item.mary_vote}
            isYou={viewer === "mary"}
            pending={pending}
            onVote={(next) => onVote("mary", next)}
          />
        </div>
      </div>
    </li>
  );
}

function VoterThumbs({
  voter,
  vote,
  isYou,
  pending,
  onVote,
}: {
  voter: MovieVoter;
  vote: MovieVote | null;
  isYou: boolean;
  pending: boolean;
  onVote: (vote: MovieVote | null) => void;
}) {
  function toggle(next: MovieVote) {
    onVote(vote === next ? null : next);
  }

  return (
    <div
      className={`rounded-xl border px-2.5 py-2 sm:px-3 sm:py-2.5 ${
        isYou ? "border-brand/25 bg-brand/[0.04]" : "border-ink/[0.06] bg-cream/50"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {voterLabel(voter)}
        {isYou ? " · you" : ""}
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <ThumbButton
          kind="up"
          active={vote === "up"}
          disabled={pending}
          onClick={() => toggle("up")}
        />
        <ThumbButton
          kind="down"
          active={vote === "down"}
          disabled={pending}
          onClick={() => toggle("down")}
        />
      </div>
    </div>
  );
}

function ThumbButton({
  kind,
  active,
  disabled,
  onClick,
}: {
  kind: MovieVote;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const up = kind === "up";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      aria-label={up ? "Thumbs up" : "Thumbs down"}
      className={`flex min-h-10 min-w-10 flex-1 items-center justify-center rounded-lg border text-sm transition disabled:opacity-50 ${
        active
          ? up
            ? "border-brand/40 bg-brand/15 text-brand-dark"
            : "border-accent-rose/40 bg-accent-rose/10 text-accent-rose"
          : "border-ink/10 bg-white text-ink-muted hover:bg-cream"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-5 w-5 ${up ? "" : "rotate-180"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M7 10v10" />
        <path d="M15 5.5V10h4.2a2 2 0 0 1 1.95 2.45l-1.3 5.2A2.5 2.5 0 0 1 17.4 20H7V10l3.2-5.8A1.5 1.5 0 0 1 11.5 3.5h.3A2.7 2.7 0 0 1 14.5 6.2L15 5.5Z" />
      </svg>
    </button>
  );
}
