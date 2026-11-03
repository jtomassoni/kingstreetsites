import {
  BOARD_GROUPS,
  type BoardGroup,
} from "@projects/types";

export const BOARD_GROUP_LABELS: Record<BoardGroup, string> = {
  backlog: "Backlog",
  planned: "Planned",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export function isBoardGroup(value: string): value is BoardGroup {
  return (BOARD_GROUPS as readonly string[]).includes(value);
}

export function boardGroupOrder(group: BoardGroup): number {
  return BOARD_GROUPS.indexOf(group);
}
