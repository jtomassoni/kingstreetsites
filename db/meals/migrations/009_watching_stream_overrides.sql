-- Streaming watch times: when the household can actually press play.
-- TVMaze network listings stay in listed_*; air_* is the watchable schedule
-- once schedule_locked (a stream override) is set. Sync must not clobber air_*.

ALTER TABLE public.watching_shows
  ADD COLUMN IF NOT EXISTS watch_platform text,
  ADD COLUMN IF NOT EXISTS schedule_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS listed_air_days text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS listed_air_time_local time;

UPDATE public.watching_shows
SET
  listed_air_days = air_days,
  listed_air_time_local = air_time_local
WHERE
  (listed_air_days = '{}' OR listed_air_days IS NULL)
  AND listed_air_time_local IS NULL
  AND (cardinality(air_days) > 0 OR air_time_local IS NOT NULL);

ALTER TABLE public.watching_shows
  DROP CONSTRAINT IF EXISTS watching_shows_listed_air_days_valid;

ALTER TABLE public.watching_shows
  ADD CONSTRAINT watching_shows_listed_air_days_valid CHECK (
    listed_air_days <@ ARRAY[
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
    ]::text[]
  );

CREATE TABLE IF NOT EXISTS public.watching_show_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES public.watching_shows (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  platform text NOT NULL,
  air_days text[] NOT NULL DEFAULT '{}',
  air_time_local time,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watching_show_streams_air_days_valid CHECK (
    air_days <@ ARRAY[
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
    ]::text[]
  ),
  CONSTRAINT watching_show_streams_platform_nonempty CHECK (
    length(trim(platform)) > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS watching_show_streams_show_platform_unique
  ON public.watching_show_streams (show_id, platform);

CREATE UNIQUE INDEX IF NOT EXISTS watching_show_streams_one_primary
  ON public.watching_show_streams (show_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS watching_show_streams_household_idx
  ON public.watching_show_streams (household_id);

DROP TRIGGER IF EXISTS watching_show_streams_set_updated_at ON public.watching_show_streams;
CREATE TRIGGER watching_show_streams_set_updated_at
  BEFORE UPDATE ON public.watching_show_streams
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.watching_shows.watch_platform IS
  'Primary streaming service where the household watches this show.';

COMMENT ON COLUMN public.watching_shows.schedule_locked IS
  'When true, air_days/air_time_local are stream overrides; TVMaze sync must not overwrite them.';

COMMENT ON COLUMN public.watching_shows.listed_air_days IS
  'Network/TVMaze weekly nights (reference only when schedule_locked).';

COMMENT ON COLUMN public.watching_shows.listed_air_time_local IS
  'Network/TVMaze Mountain Time listing (reference only when schedule_locked).';

COMMENT ON TABLE public.watching_show_streams IS
  'Per-show streaming availability overrides (Max 1am vs Food Network 8/7c, etc.).';
