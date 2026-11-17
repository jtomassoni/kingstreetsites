-- Movie wishlist: titles to watch, then James/Mary thumbs after watching.

CREATE TABLE IF NOT EXISTS public.movie_wishlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  title text NOT NULL,
  year integer CHECK (year IS NULL OR (year >= 1888 AND year <= 2100)),
  notes text,
  status text NOT NULL DEFAULT 'wishlist'
    CHECK (status IN ('wishlist', 'watched')),
  james_vote text CHECK (james_vote IS NULL OR james_vote IN ('up', 'down')),
  mary_vote text CHECK (mary_vote IS NULL OR mary_vote IN ('up', 'down')),
  watched_at timestamptz,
  added_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS movie_wishlist_household_status_idx
  ON public.movie_wishlist (household_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS movie_wishlist_household_title_idx
  ON public.movie_wishlist (household_id, lower(title));

DROP TRIGGER IF EXISTS movie_wishlist_set_updated_at ON public.movie_wishlist;
CREATE TRIGGER movie_wishlist_set_updated_at
  BEFORE UPDATE ON public.movie_wishlist
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.movie_wishlist IS
  'Household movie wishlist and watched ratings (James/Mary thumbs).';
