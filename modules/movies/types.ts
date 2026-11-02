import type { Weekday } from "@movies/lib/timezone";

export type WatchingStatus = "watching" | "paused" | "finished" | "dropped";

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
  air_days: Weekday[];
  air_time_local: string | null;
  source_timezone: string | null;
  timezone: string;
  notes: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
};
