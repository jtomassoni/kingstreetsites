CREATE TABLE public.household_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  parent_entity_type text,
  parent_entity_id uuid,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.household_activity IS
  'Audit trail of household member actions on recipes, meal plans, and related entities.';

CREATE INDEX idx_household_activity_household_created
  ON public.household_activity (household_id, created_at DESC);

CREATE INDEX idx_household_activity_entity
  ON public.household_activity (entity_type, entity_id, created_at DESC);

CREATE INDEX idx_household_activity_parent
  ON public.household_activity (parent_entity_type, parent_entity_id, created_at DESC);
