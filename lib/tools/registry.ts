export type ToolId = "meals" | "movies" | "projects" | "arcade";

export type ToolAccess = {
  /** Must be signed in (SUPER_ADMIN_USERS or APP_USERS). */
  requireAuth: true;
  /** Household tools never imply CRM; CRM is super-admin only. */
  businessAdmin: false;
};

export type ToolDefinition = {
  id: ToolId;
  title: string;
  description: string;
  /** Lucide icon name used by the dashboard. */
  icon: "UtensilsCrossed" | "Clapperboard" | "ListTodo" | "Gamepad2";
  href: string;
  access: ToolAccess;
  /** When false, the tool route is a documented stub. */
  implemented: boolean;
};

export const TOOLS: readonly ToolDefinition[] = [
  {
    id: "meals",
    title: "Meal Planner",
    description: "Shared weekly plans, recipes, and grocery lists for the household.",
    icon: "UtensilsCrossed",
    href: "/tools/meals",
    access: { requireAuth: true, businessAdmin: false },
    implemented: true,
  },
  {
    id: "movies",
    title: "Movie List",
    description:
      "TV shows we’re watching now — nights and times in Mountain Time.",
    icon: "Clapperboard",
    href: "/tools/movies",
    access: { requireAuth: true, businessAdmin: false },
    implemented: true,
  },
  {
    id: "projects",
    title: "House Projects",
    description: "Shared to-do list for home projects and chores.",
    icon: "ListTodo",
    href: "/tools/projects",
    access: { requireAuth: true, businessAdmin: false },
    implemented: false,
  },
  {
    id: "arcade",
    title: "Shoot ’Em Up",
    description: "Hold the Lane — a portrait shooter for quick rounds.",
    icon: "Gamepad2",
    href: "/tools/arcade",
    access: { requireAuth: true, businessAdmin: false },
    implemented: true,
  },
] as const;

export function getTool(id: ToolId): ToolDefinition {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}

export function toolsNavItems() {
  return TOOLS.map((t) => ({
    id: t.id,
    title: t.title,
    href: t.href,
    implemented: t.implemented,
  }));
}
