"use client";

import { useState } from "react";
import { WatchingApp } from "@movies/components/watching-app";
import { WishlistApp } from "@movies/components/wishlist-app";
import type { MovieVoter, MovieWishlistItem, WatchingShow } from "@movies/types";

type Tab = "watching" | "wishlist";

type Props = {
  initialShows: WatchingShow[];
  initialWishlist: MovieWishlistItem[];
  timezoneLabel: string;
  viewer: MovieVoter | null;
  initialTab?: Tab;
};

export function MoviesShell({
  initialShows,
  initialWishlist,
  timezoneLabel,
  viewer,
  initialTab = "watching",
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div>
      <div className="border-b border-ink/[0.06] bg-cream/80">
        <div className="mx-auto flex max-w-5xl gap-1 px-3 pt-4 sm:max-w-5xl sm:px-6 sm:pt-6">
          <TabButton
            active={tab === "watching"}
            onClick={() => setTab("watching")}
            label="Watching"
          />
          <TabButton
            active={tab === "wishlist"}
            onClick={() => setTab("wishlist")}
            label="Wishlist"
          />
        </div>
      </div>

      {tab === "watching" ? (
        <WatchingApp
          initialShows={initialShows}
          timezoneLabel={timezoneLabel}
        />
      ) : (
        <WishlistApp initialItems={initialWishlist} viewer={viewer} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-h-11 rounded-t-xl px-4 py-2.5 text-sm font-semibold transition sm:min-h-10 sm:px-5 ${
        active
          ? "bg-white text-ink shadow-[0_-1px_0_0_rgba(0,0,0,0.04)]"
          : "text-ink-muted hover:text-ink"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {label}
      {active ? (
        <span
          className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand"
          aria-hidden
        />
      ) : null}
    </button>
  );
}
