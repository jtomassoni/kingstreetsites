-- Add meal_defaults if migrating from an older 001_init without the column.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS meal_defaults jsonb NOT NULL DEFAULT '{
    "breakfast": [],
    "lunch": [],
    "dinner": []
  }'::jsonb;

COMMENT ON COLUMN public.profiles.meal_defaults IS
  'Usual meal options per slot: { breakfast, lunch, dinner } as [{ title }]. Rotated onto empty slots on new weeks and Fill week.';
