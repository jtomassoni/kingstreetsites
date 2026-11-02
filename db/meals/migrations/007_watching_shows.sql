-- Shared household TV shows we're currently watching (Movie List / Watching tool).
-- Air times are stored as Mountain Time wall-clock (America/Denver).

CREATE TABLE IF NOT EXISTS public.watching_shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  tvmaze_id integer,
  title text NOT NULL,
  image_url text,
  network text,
  summary text,
  status text NOT NULL DEFAULT 'watching'
    CHECK (status IN ('watching', 'paused', 'finished', 'dropped')),
  air_days text[] NOT NULL DEFAULT '{}',
  air_time_local time,
  source_timezone text,
  timezone text NOT NULL DEFAULT 'America/Denver',
  notes text,
  added_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watching_shows_air_days_valid CHECK (
    air_days <@ ARRAY[
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
    ]::text[]
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS watching_shows_household_tvmaze_unique
  ON public.watching_shows (household_id, tvmaze_id)
  WHERE tvmaze_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS watching_shows_household_status_idx
  ON public.watching_shows (household_id, status);

DROP TRIGGER IF EXISTS watching_shows_set_updated_at ON public.watching_shows;
CREATE TRIGGER watching_shows_set_updated_at
  BEFORE UPDATE ON public.watching_shows
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.watching_shows IS
  'TV shows the household is watching; schedule stored in America/Denver.';

COMMENT ON COLUMN public.watching_shows.air_time_local IS
  'Weekly air time as Mountain Time wall clock (no date).';

COMMENT ON COLUMN public.watching_shows.source_timezone IS
  'Original network/webChannel timezone from TVMaze before conversion.';
