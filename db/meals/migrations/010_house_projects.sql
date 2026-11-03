-- House Projects: big home projects with costs, board groups, and comments.

CREATE TABLE IF NOT EXISTS public.house_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  board_group text NOT NULL DEFAULT 'backlog'
    CHECK (board_group IN ('backlog', 'planned', 'in_progress', 'blocked', 'done')),
  priority integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  budget_cents integer CHECK (budget_cents IS NULL OR budget_cents >= 0),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS house_projects_household_board_priority_idx
  ON public.house_projects (household_id, board_group, priority);

CREATE INDEX IF NOT EXISTS house_projects_household_archived_idx
  ON public.house_projects (household_id, archived);

DROP TRIGGER IF EXISTS house_projects_set_updated_at ON public.house_projects;
CREATE TRIGGER house_projects_set_updated_at
  BEFORE UPDATE ON public.house_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.house_projects IS
  'Household home projects with board group, priority, and optional budget.';

CREATE TABLE IF NOT EXISTS public.house_sub_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.house_projects (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'doing', 'done')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS house_sub_projects_project_sort_idx
  ON public.house_sub_projects (project_id, sort_order);

DROP TRIGGER IF EXISTS house_sub_projects_set_updated_at ON public.house_sub_projects;
CREATE TRIGGER house_sub_projects_set_updated_at
  BEFORE UPDATE ON public.house_sub_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.house_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_project_id uuid NOT NULL REFERENCES public.house_sub_projects (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'doing', 'done')),
  estimate_cents integer CHECK (estimate_cents IS NULL OR estimate_cents >= 0),
  actual_cents integer CHECK (actual_cents IS NULL OR actual_cents >= 0),
  assignee text CHECK (assignee IS NULL OR assignee IN ('james', 'mary')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS house_line_items_sub_project_sort_idx
  ON public.house_line_items (sub_project_id, sort_order);

DROP TRIGGER IF EXISTS house_line_items_set_updated_at ON public.house_line_items;
CREATE TRIGGER house_line_items_set_updated_at
  BEFORE UPDATE ON public.house_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.house_project_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  target_type text NOT NULL
    CHECK (target_type IN ('project', 'sub_project', 'line_item')),
  target_id uuid NOT NULL,
  body text NOT NULL,
  author_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS house_project_comments_target_idx
  ON public.house_project_comments (target_type, target_id, created_at);

CREATE INDEX IF NOT EXISTS house_project_comments_household_idx
  ON public.house_project_comments (household_id, created_at DESC);

COMMENT ON TABLE public.house_project_comments IS
  'Comments on house projects, sub-projects, or line items.';
