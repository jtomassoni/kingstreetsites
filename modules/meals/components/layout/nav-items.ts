import {
  Lightbulb,
  CalendarDays,
  ShoppingCart,
  BookOpen,
  History,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/tools/meals/ideas",
    label: "Ideas",
    icon: Lightbulb,
    match: (p) => p.startsWith("/tools/meals/ideas"),
  },
  {
    href: "/tools/meals/week",
    label: "Week",
    icon: CalendarDays,
    match: (p) => p.startsWith("/tools/meals/week"),
  },
  {
    href: "/tools/meals/grocery",
    label: "Grocery",
    icon: ShoppingCart,
    match: (p) => p.startsWith("/tools/meals/grocery"),
  },
  {
    href: "/tools/meals/recipes",
    label: "Recipes",
    icon: BookOpen,
    match: (p) => p.startsWith("/tools/meals/recipes"),
  },
  {
    href: "/tools/meals/history",
    label: "History",
    icon: History,
    match: (p) => p.startsWith("/tools/meals/history"),
  },
];

export const MOBILE_NAV_ITEMS = NAV_ITEMS;
