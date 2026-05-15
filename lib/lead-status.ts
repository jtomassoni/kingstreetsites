export const LEAD_STATUSES = [
  "new",
  "staged",
  "reached_out",
  "clicked",
  "replied",
  "closed_won",
  "closed_lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  staged: "Staged",
  reached_out: "Reached Out",
  clicked: "Clicked",
  replied: "Replied",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};
