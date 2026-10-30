-- Cost-controlled OpenAI meal-idea layer: generations, ideas, recipes, usage ledger.

ALTER TABLE public.ai_generations
  DROP CONSTRAINT IF EXISTS ai_generations_output_status_check;

ALTER TABLE public.ai_generations
  ADD CONSTRAINT ai_generations_output_status_check
  CHECK (output_status IN ('pending', 'success', 'error', 'validation_failed'));

ALTER TABLE public.ai_generations
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS openai_request_id text,
  ADD COLUMN IF NOT EXISTS input_tokens integer,
  ADD COLUMN IF NOT EXISTS cached_input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric(12, 8),
  ADD COLUMN IF NOT EXISTS error_category text,
  ADD COLUMN IF NOT EXISTS related_week_start date,
  ADD COLUMN IF NOT EXISTS related_meal_idea_id uuid,
  ADD COLUMN IF NOT EXISTS usage_missing boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_generations.request_hash IS
  'SHA-256 of normalized generation inputs; used for idempotency.';
COMMENT ON COLUMN public.ai_generations.estimated_cost_usd IS
  'Estimated USD from recorded token usage and centralized model pricing.';
COMMENT ON COLUMN public.ai_generations.error_category IS
  'Safe error category only; never store API keys or full prompts.';

CREATE TABLE public.ai_meal_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  weekly_plan_id uuid NOT NULL REFERENCES public.weekly_plans (id) ON DELETE CASCADE,
  generation_id uuid REFERENCES public.ai_generations (id) ON DELETE SET NULL,
  generated_id text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  cuisine text,
  prep_time_minutes integer,
  cook_time_minutes integer,
  difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard')),
  primary_protein text,
  ingredient_preview text[] NOT NULL DEFAULT '{}',
  applicable_members text[] NOT NULL DEFAULT '{}',
  fit_reason text,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'replaced')),
  recipe_id uuid REFERENCES public.recipes (id) ON DELETE SET NULL,
  replaced_by_idea_id uuid REFERENCES public.ai_meal_ideas (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_meal_ideas_generated_id_unique UNIQUE (household_id, generated_id)
);

COMMENT ON TABLE public.ai_meal_ideas IS
  'Persisted OpenAI meal-idea suggestions for a household week. Never generated on page load.';

CREATE TABLE public.ai_generated_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  meal_idea_id uuid NOT NULL REFERENCES public.ai_meal_ideas (id) ON DELETE CASCADE,
  generation_id uuid REFERENCES public.ai_generations (id) ON DELETE SET NULL,
  recipe_id uuid NOT NULL REFERENCES public.recipes (id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_generated_recipes_idea_unique UNIQUE (meal_idea_id)
);

COMMENT ON TABLE public.ai_generated_recipes IS
  'Full recipes generated from an approved meal idea. Reused unless the user regenerates.';

CREATE TABLE public.ai_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES public.households (id) ON DELETE CASCADE,
  generation_id uuid REFERENCES public.ai_generations (id) ON DELETE SET NULL,
  operation_type text NOT NULL,
  model text NOT NULL,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12, 8) NOT NULL,
  usage_missing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_usage_ledger IS
  'Append-only estimated OpenAI spend from recorded token usage. Lifetime application budget source of truth.';

ALTER TABLE public.ai_generations
  DROP CONSTRAINT IF EXISTS ai_generations_related_meal_idea_id_fkey;

ALTER TABLE public.ai_generations
  ADD CONSTRAINT ai_generations_related_meal_idea_id_fkey
  FOREIGN KEY (related_meal_idea_id)
  REFERENCES public.ai_meal_ideas (id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX ai_generations_active_hash_unique
  ON public.ai_generations (household_id, request_hash)
  WHERE request_hash IS NOT NULL
    AND output_status IN ('pending', 'success');

CREATE INDEX idx_ai_meal_ideas_plan
  ON public.ai_meal_ideas (household_id, weekly_plan_id, created_at DESC);

CREATE INDEX idx_ai_meal_ideas_status
  ON public.ai_meal_ideas (household_id, status);

CREATE INDEX idx_ai_usage_ledger_created
  ON public.ai_usage_ledger (created_at DESC);

CREATE INDEX idx_ai_generations_request_hash
  ON public.ai_generations (household_id, request_hash);

CREATE INDEX idx_ai_generations_requested_by_created
  ON public.ai_generations (requested_by, created_at DESC);

CREATE TRIGGER trg_ai_meal_ideas_updated_at
  BEFORE UPDATE ON public.ai_meal_ideas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_ai_generated_recipes_updated_at
  BEFORE UPDATE ON public.ai_generated_recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
