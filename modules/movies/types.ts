import type { Weekday } from "@movies/lib/timezone";
import type { WatchPlatformId } from "@movies/lib/platforms";

export type WatchingStatus = "watching" | "paused" | "finished" | "dropped";

export type WatchingShowStream = {
  id: string;
  show_id: string;
  household_id: string;
  platform: WatchPlatformId | string;
  air_days: Weekday[];
  air_time_local: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WatchingShow = {
  id: string;
  household_id: string;
  tvmaze_id: number | null;
  title: string;
  image_url: string | null;
  network: string | null;
  summary: string | null;
  status: WatchingStatus;
  currently_airing: boolean;
  tv_status: string | null;
  next_air_at: string | null;
  /** Watchable schedule (stream override when schedule_locked). */
  air_days: Weekday[];
  air_time_local: string | null;
  /** Primary service where we actually watch. */
  watch_platform: WatchPlatformId | string | null;
  /** True once a stream override owns the calendar time. */
  schedule_locked: boolean;
  /** TVMaze / network listing — reference only when locked. */
  listed_air_days: Weekday[];
  listed_air_time_local: string | null;
  source_timezone: string | null;
  timezone: string;
  notes: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
  streams: WatchingShowStream[];
};
