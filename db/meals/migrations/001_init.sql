-- Neon-ready consolidated schema for household meal-planning app
-- Extensions: pgcrypto provides gen_random_uuid()

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Schema migrations tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Trigger function that sets updated_at to now() on row update.';

CREATE OR REPLACE FUNCTION public.is_monday(p_date date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXTRACT(ISODOW FROM p_date) = 1;
$$;

COMMENT ON FUNCTION public.is_monday(date) IS
  'Returns true when the date falls on a Monday (ISO week day 1).';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text,
  email text,
  avatar_url text,
  dietary_restrictions text[] NOT NULL DEFAULT '{}',
  ingredient_dislikes text[] NOT NULL DEFAULT '{}',
  ingredient_preferences text[] NOT NULL DEFAULT '{}',
  favorite_cuisines text[] NOT NULL DEFAULT '{}',
  nutrition_notes text,
  portion_multiplier numeric NOT NULL DEFAULT 1 CHECK (portion_multiplier > 0),
  day_meal_needs jsonb NOT NULL DEFAULT '{
    "defaultMeals": ["breakfast", "lunch", "dinner"],
    "weekdayMeals": null,
    "weekendMeals": null,
    "workingDayMods": { "add": ["snacks"], "remove": [] }
  }'::jsonb,
  appetite_prefs jsonb NOT NULL DEFAULT '{
    "meat": "normal",
    "veggies": "normal",
    "dairy": "normal",
    "other": "normal"
  }'::jsonb,
  meal_defaults jsonb NOT NULL DEFAULT '{
    "breakfast": [],
    "lunch": [],
    "dinner": []
  }'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Extended user profile data.';

COMMENT ON COLUMN public.profiles.day_meal_needs IS
  'Meal slots needed on default/weekday/weekend days, plus add/remove mods for working days.';

COMMENT ON COLUMN public.profiles.appetite_prefs IS
  'Per-person appetite by category: meat, veggies, dairy, other — each light|normal|heavy. Used to scale AI recipe generation.';

CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.households IS
  'A household group that shares meal plans, recipes, and grocery lists.';

CREATE TABLE public.household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_members_household_user_unique UNIQUE (household_id, user_id)
);

COMMENT ON TABLE public.household_members IS
  'Membership linking users to households.';

CREATE TABLE public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  notify_meals_added boolean NOT NULL DEFAULT true,
  notify_plan_approved boolean NOT NULL DEFAULT true,
  notify_grocery_generated boolean NOT NULL DEFAULT true,
  notify_grocery_changed boolean NOT NULL DEFAULT true,
  notify_meal_review boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_user_household_unique UNIQUE (user_id, household_id)
);

COMMENT ON TABLE public.user_preferences IS
  'Per-user, per-household notification preferences.';

CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  source_type text NOT NULL CHECK (source_type IN ('household', 'family', 'ai', 'imported', 'transcribed')),
  source_name text,
  cuisine text,
  meal_types text[] NOT NULL DEFAULT '{}',
  dietary_tags text[] NOT NULL DEFAULT '{}',
  is_favorite boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.recipes IS
  'Household recipe catalog. Versioned content lives in recipe_versions.';

CREATE TABLE public.recipe_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  is_current boolean NOT NULL DEFAULT false,
  change_summary text,
  default_servings numeric CHECK (default_servings IS NULL OR default_servings > 0),
  prep_time_minutes integer CHECK (prep_time_minutes IS NULL OR prep_time_minutes >= 0),
  cook_time_minutes integer CHECK (cook_time_minutes IS NULL OR cook_time_minutes >= 0),
  total_time_minutes integer CHECK (total_time_minutes IS NULL OR total_time_minutes >= 0),
  equipment text[] NOT NULL DEFAULT '{}',
  storage_instructions text,
  reheating_instructions text,
  freezing_suitable boolean,
  leftover_notes text,
  difficulty text CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_versions_recipe_version_unique UNIQUE (recipe_id, version_number)
);

COMMENT ON TABLE public.recipe_versions IS
  'Immutable-ish version snapshots for a recipe.';

CREATE TABLE public.recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_version_id uuid NOT NULL REFERENCES public.recipe_versions (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  raw_text text,
  ingredient_name text NOT NULL,
  quantity numeric CHECK (quantity IS NULL OR quantity >= 0),
  unit text,
  preparation_note text,
  optional boolean NOT NULL DEFAULT false,
  grocery_category text,
  preferred_store text CHECK (preferred_store IS NULL OR preferred_store IN ('king_soopers', 'whole_foods', 'costco', 'any')),
  costco_bulk_candidate boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.recipe_ingredients IS
  'Ingredients for a specific recipe version. grocery_category values align with standard store sections (see grocery_items comment).';

CREATE TABLE public.recipe_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_version_id uuid NOT NULL REFERENCES public.recipe_versions (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  step_number integer NOT NULL CHECK (step_number > 0),
  instruction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_steps_version_step_unique UNIQUE (recipe_version_id, step_number)
);

COMMENT ON TABLE public.recipe_steps IS
  'Ordered preparation steps for a recipe version.';

CREATE TABLE public.recipe_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_likes_user_recipe_unique UNIQUE (user_id, recipe_id)
);

COMMENT ON TABLE public.recipe_likes IS
  'Per-user likes on household recipes. Each member maintains their own liked set.';

CREATE TABLE public.weekly_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  week_start date NOT NULL CHECK (public.is_monday(week_start)),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'grocery_generated', 'completed', 'archived')),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_plans_household_week_unique UNIQUE (household_id, week_start)
);

COMMENT ON TABLE public.weekly_plans IS
  'Weekly meal plan for a household. week_start must be a Monday.';

CREATE TABLE public.plan_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_id uuid NOT NULL REFERENCES public.weekly_plans (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  day_date date NOT NULL,
  profile_type text NOT NULL DEFAULT 'normal' CHECK (profile_type IN ('normal', 'workday', 'long_day', 'quick_cook', 'reheat_only', 'eating_out', 'custom')),
  applies_to text NOT NULL DEFAULT 'both' CHECK (applies_to IN ('both', 'specific')),
  applies_to_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  max_active_cook_minutes integer CHECK (max_active_cook_minutes IS NULL OR max_active_cook_minutes >= 0),
  max_total_cook_minutes integer CHECK (max_total_cook_minutes IS NULL OR max_total_cook_minutes >= 0),
  needs_meal_prep boolean NOT NULL DEFAULT false,
  needs_portable_snacks boolean NOT NULL DEFAULT false,
  reheat_only boolean NOT NULL DEFAULT false,
  working_user_ids uuid[] NOT NULL DEFAULT '{}',
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_days_plan_date_unique UNIQUE (weekly_plan_id, day_date),
  CONSTRAINT plan_days_applies_to_user_consistency CHECK (
    (applies_to = 'both' AND applies_to_user_id IS NULL)
    OR (applies_to = 'specific' AND applies_to_user_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.plan_days IS
  'Day-level planning profile within a weekly plan. applies_to_user_id is set only when applies_to = specific.';

COMMENT ON COLUMN public.plan_days.working_user_ids IS
  'Household members marked as at work on this day; meal mods come from each profile.';

CREATE TABLE public.planned_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_day_id uuid NOT NULL REFERENCES public.plan_days (id) ON DELETE CASCADE,
  weekly_plan_id uuid NOT NULL REFERENCES public.weekly_plans (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack_prep', 'other')),
  assigned_to text NOT NULL DEFAULT 'both' CHECK (assigned_to IN ('both', 'specific')),
  assigned_to_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  title text NOT NULL,
  recipe_id uuid REFERENCES public.recipes (id) ON DELETE SET NULL,
  recipe_version_id uuid REFERENCES public.recipe_versions (id) ON DELETE SET NULL,
  servings numeric CHECK (servings IS NULL OR servings > 0),
  notes text,
  is_leftovers boolean NOT NULL DEFAULT false,
  leftover_from_meal_id uuid REFERENCES public.planned_meals (id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planned_meals_assigned_to_user_consistency CHECK (
    (assigned_to = 'both' AND assigned_to_user_id IS NULL)
    OR (assigned_to = 'specific' AND assigned_to_user_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.planned_meals IS
  'Individual meal slots on a plan day. Can reference a recipe or be a free-text meal idea.';

CREATE TABLE public.meal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  planned_meal_id uuid REFERENCES public.planned_meals (id) ON DELETE SET NULL,
  recipe_id uuid REFERENCES public.recipes (id) ON DELETE SET NULL,
  recipe_version_id uuid REFERENCES public.recipe_versions (id) ON DELETE SET NULL,
  cooked_at timestamptz NOT NULL DEFAULT now(),
  cooked_for text NOT NULL DEFAULT 'both' CHECK (cooked_for IN ('both', 'specific')),
  cooked_for_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  cooked_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  overall_rating integer CHECK (overall_rating IS NULL OR (overall_rating >= 1 AND overall_rating <= 5)),
  review text,
  would_make_again text CHECK (would_make_again IS NULL OR would_make_again IN ('yes', 'maybe', 'no')),
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_history_cooked_for_user_consistency CHECK (
    (cooked_for = 'both' AND cooked_for_user_id IS NULL)
    OR (cooked_for = 'specific' AND cooked_for_user_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.meal_history IS
  'Historical record of cooked meals with ratings and reviews.';

CREATE TABLE public.meal_history_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_history_id uuid NOT NULL REFERENCES public.meal_history (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  individual_rating integer CHECK (individual_rating IS NULL OR (individual_rating >= 1 AND individual_rating <= 5)),
  CONSTRAINT meal_history_participants_meal_user_unique UNIQUE (meal_history_id, user_id)
);

COMMENT ON TABLE public.meal_history_participants IS
  'Per-participant ratings for a meal history entry.';

CREATE TABLE public.meal_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_history_id uuid NOT NULL REFERENCES public.meal_history (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  thumbnail_path text,
  mime_type text,
  file_size_bytes bigint CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meal_photos IS
  'Photo metadata for meal history entries. Files live in object storage under {household_id}/ paths.';

CREATE TABLE public.grocery_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  weekly_plan_id uuid REFERENCES public.weekly_plans (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  generated_at timestamptz,
  generated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.grocery_lists IS
  'Grocery lists generated from weekly plans or created manually.';

CREATE TABLE public.grocery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_list_id uuid NOT NULL REFERENCES public.grocery_lists (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric CHECK (quantity IS NULL OR quantity >= 0),
  unit text,
  section text,
  preferred_store text CHECK (preferred_store IS NULL OR preferred_store IN ('king_soopers', 'whole_foods', 'costco', 'any')),
  costco_bulk_candidate boolean NOT NULL DEFAULT false,
  pantry_status text NOT NULL DEFAULT 'needed' CHECK (pantry_status IN ('needed', 'owned', 'purchased')),
  is_checked boolean NOT NULL DEFAULT false,
  checked_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  checked_at timestamptz,
  assigned_shopper uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  notes text,
  is_manual boolean NOT NULL DEFAULT false,
  is_user_edited boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.grocery_items IS
  'Line items on a grocery list. Common section values: Produce, Meat and seafood, Dairy and eggs, Deli, Bakery, Frozen, Pantry, Canned and jarred, Pasta rice and grains, Spices and seasonings, Snacks, Beverages, Household and storage, Other.';

CREATE TABLE public.grocery_item_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_item_id uuid NOT NULL REFERENCES public.grocery_items (id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  planned_meal_id uuid REFERENCES public.planned_meals (id) ON DELETE SET NULL,
  recipe_ingredient_id uuid REFERENCES public.recipe_ingredients (id) ON DELETE SET NULL,
  original_quantity numeric CHECK (original_quantity IS NULL OR original_quantity >= 0),
  original_unit text,
  note text
);

COMMENT ON TABLE public.grocery_item_sources IS
  'Provenance linking aggregated grocery items back to planned meals and recipe ingredients.';

CREATE TABLE public.store_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  ingredient_name text NOT NULL,
  preferred_store text NOT NULL CHECK (preferred_store IN ('king_soopers', 'whole_foods', 'costco', 'any')),
  costco_bulk_preferred boolean NOT NULL DEFAULT false,
  notes text,
  CONSTRAINT store_preferences_household_ingredient_unique UNIQUE (household_id, ingredient_name)
);

COMMENT ON TABLE public.store_preferences IS
  'Default store preferences for specific ingredients within a household.';

CREATE TABLE public.ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  requested_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  operation_type text NOT NULL,
  related_plan_id uuid REFERENCES public.weekly_plans (id) ON DELETE SET NULL,
  related_recipe_id uuid REFERENCES public.recipes (id) ON DELETE SET NULL,
  model text,
  input_summary text,
  output_status text NOT NULL CHECK (output_status IN ('success', 'error', 'validation_failed')),
  token_usage jsonb,
  error_details text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_generations IS
  'Audit log of AI-assisted operations (meal planning, recipe generation, etc.).';

CREATE TABLE public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  dedupe_key text NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_events_household_dedupe_unique UNIQUE (household_id, dedupe_key)
);

COMMENT ON TABLE public.notification_events IS
  'Outbound notification event log with deduplication per household.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_household_members_user_id ON public.household_members (user_id);
CREATE INDEX idx_household_members_household_id ON public.household_members (household_id);
CREATE INDEX idx_household_members_household_active ON public.household_members (household_id) WHERE is_active = true;

CREATE INDEX idx_user_preferences_user_id ON public.user_preferences (user_id);
CREATE INDEX idx_user_preferences_household_id ON public.user_preferences (household_id);

CREATE INDEX idx_recipes_household_id ON public.recipes (household_id);
CREATE INDEX idx_recipes_household_active ON public.recipes (household_id) WHERE is_active = true;

CREATE INDEX idx_recipe_versions_recipe_id ON public.recipe_versions (recipe_id);
CREATE INDEX idx_recipe_versions_household_id ON public.recipe_versions (household_id);
CREATE INDEX idx_recipe_versions_current ON public.recipe_versions (recipe_id) WHERE is_current = true;

CREATE INDEX idx_recipe_ingredients_version_id ON public.recipe_ingredients (recipe_version_id);
CREATE INDEX idx_recipe_ingredients_household_id ON public.recipe_ingredients (household_id);

CREATE INDEX idx_recipe_steps_version_id ON public.recipe_steps (recipe_version_id);
CREATE INDEX idx_recipe_steps_household_id ON public.recipe_steps (household_id);

CREATE INDEX idx_recipe_likes_user_id ON public.recipe_likes (user_id);
CREATE INDEX idx_recipe_likes_recipe_id ON public.recipe_likes (recipe_id);
CREATE INDEX idx_recipe_likes_household_id ON public.recipe_likes (household_id);
CREATE INDEX idx_recipe_likes_user_household ON public.recipe_likes (user_id, household_id);

CREATE INDEX idx_weekly_plans_household_id ON public.weekly_plans (household_id);
CREATE INDEX idx_weekly_plans_household_status ON public.weekly_plans (household_id, status);
CREATE INDEX idx_weekly_plans_week_start ON public.weekly_plans (week_start);

CREATE INDEX idx_plan_days_weekly_plan_id ON public.plan_days (weekly_plan_id);
CREATE INDEX idx_plan_days_household_id ON public.plan_days (household_id);
CREATE INDEX idx_plan_days_day_date ON public.plan_days (day_date);

CREATE INDEX idx_planned_meals_plan_day_id ON public.planned_meals (plan_day_id);
CREATE INDEX idx_planned_meals_weekly_plan_id ON public.planned_meals (weekly_plan_id);
CREATE INDEX idx_planned_meals_household_id ON public.planned_meals (household_id);
CREATE INDEX idx_planned_meals_recipe_id ON public.planned_meals (recipe_id);

CREATE INDEX idx_meal_history_household_id ON public.meal_history (household_id);
CREATE INDEX idx_meal_history_cooked_at ON public.meal_history (household_id, cooked_at DESC);
CREATE INDEX idx_meal_history_recipe_id ON public.meal_history (recipe_id);

CREATE INDEX idx_meal_history_participants_meal_id ON public.meal_history_participants (meal_history_id);
CREATE INDEX idx_meal_history_participants_user_id ON public.meal_history_participants (user_id);

CREATE INDEX idx_meal_photos_meal_history_id ON public.meal_photos (meal_history_id);
CREATE INDEX idx_meal_photos_household_id ON public.meal_photos (household_id);

CREATE INDEX idx_grocery_lists_household_id ON public.grocery_lists (household_id);
CREATE INDEX idx_grocery_lists_weekly_plan_id ON public.grocery_lists (weekly_plan_id);
CREATE INDEX idx_grocery_lists_status ON public.grocery_lists (household_id, status);

CREATE INDEX idx_grocery_items_list_id ON public.grocery_items (grocery_list_id);
CREATE INDEX idx_grocery_items_household_id ON public.grocery_items (household_id);
CREATE INDEX idx_grocery_items_section ON public.grocery_items (grocery_list_id, section);

CREATE INDEX idx_grocery_item_sources_item_id ON public.grocery_item_sources (grocery_item_id);
CREATE INDEX idx_grocery_item_sources_household_id ON public.grocery_item_sources (household_id);

CREATE INDEX idx_store_preferences_household_id ON public.store_preferences (household_id);

CREATE INDEX idx_ai_generations_household_id ON public.ai_generations (household_id);
CREATE INDEX idx_ai_generations_created_at ON public.ai_generations (household_id, created_at DESC);

CREATE INDEX idx_notification_events_household_id ON public.notification_events (household_id);
CREATE INDEX idx_notification_events_sent_at ON public.notification_events (household_id, sent_at);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_households_updated_at
  BEFORE UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_weekly_plans_updated_at
  BEFORE UPDATE ON public.weekly_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_plan_days_updated_at
  BEFORE UPDATE ON public.plan_days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_planned_meals_updated_at
  BEFORE UPDATE ON public.planned_meals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_meal_history_updated_at
  BEFORE UPDATE ON public.meal_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_grocery_lists_updated_at
  BEFORE UPDATE ON public.grocery_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_grocery_items_updated_at
  BEFORE UPDATE ON public.grocery_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
