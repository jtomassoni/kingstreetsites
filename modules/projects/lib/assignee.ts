import type { Assignee } from "@projects/types";

/** Map session email to james/mary for line-item assignee. */
export function assigneeFromEmail(email: string): Assignee | null {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.includes("mary")) return "mary";
  if (local.includes("james") || local.includes("jt") || local.includes("tomassoni")) {
    return "james";
  }
  return null;
}

export function assigneeLabel(assignee: Assignee | null): string {
  if (assignee === "james") return "James";
  if (assignee === "mary") return "Mary";
  return "Unassigned";
}
