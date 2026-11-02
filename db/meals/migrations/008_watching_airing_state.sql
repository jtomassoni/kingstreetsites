-- Track whether a show has upcoming episodes (calendar eligibility).

ALTER TABLE public.watching_shows
  ADD COLUMN IF NOT EXISTS currently_airing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tv_status text,
  ADD COLUMN IF NOT EXISTS next_air_at timestamptz;

CREATE INDEX IF NOT EXISTS watching_shows_household_airing_idx
  ON public.watching_shows (household_id, currently_airing)
  WHERE status = 'watching';

COMMENT ON COLUMN public.watching_shows.currently_airing IS
  'True when TVMaze reports a next episode; only airing shows appear on the week calendar.';

COMMENT ON COLUMN public.watching_shows.tv_status IS
  'TVMaze show status (Running, Ended, …).';

COMMENT ON COLUMN public.watching_shows.next_air_at IS
  'Next episode airstamp from TVMaze, when known.';
