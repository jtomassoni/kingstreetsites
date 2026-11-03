export const BOARD_GROUPS = [
  "backlog",
  "planned",
  "in_progress",
  "blocked",
  "done",
] as const;

export type BoardGroup = (typeof BOARD_GROUPS)[number];

export const WORK_STATUSES = ["todo", "doing", "done"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const ASSIGNEES = ["james", "mary"] as const;
export type Assignee = (typeof ASSIGNEES)[number];

export type CommentTargetType = "project" | "sub_project" | "line_item";

export type HouseProject = {
  id: string;
  household_id: string;
  title: string;
  description: string | null;
  board_group: BoardGroup;
  priority: number;
  archived: boolean;
  budget_cents: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HouseSubProject = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: WorkStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type HouseLineItem = {
  id: string;
  sub_project_id: string;
  title: string;
  description: string | null;
  status: WorkStatus;
  estimate_cents: number | null;
  actual_cents: number | null;
  assignee: Assignee | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type HouseProjectComment = {
  id: string;
  household_id: string;
  target_type: CommentTargetType;
  target_id: string;
  body: string;
  author_profile_id: string | null;
  author_display_name: string | null;
  created_at: string;
};

export type CostRollup = {
  estimate_cents: number;
  actual_cents: number;
  budget_cents: number | null;
  remaining_cents: number | null;
};

export type ProjectListItem = HouseProject & {
  rollup: CostRollup;
  sub_project_count: number;
  open_item_count: number;
};

export type ProjectDetail = HouseProject & {
  rollup: CostRollup;
  sub_projects: Array<
    HouseSubProject & {
      rollup: CostRollup;
      line_items: HouseLineItem[];
    }
  >;
};
