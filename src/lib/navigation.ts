import { CalendarCheck, LayoutList, Settings, Users, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to ADMIN once auth/roles exist (Phase 2). */
  adminOnly?: boolean;
};

export const navItems: NavItem[] = [
  { href: "/today", label: "Hôm nay", icon: CalendarCheck },
  { href: "/tasks", label: "Công việc", icon: LayoutList },
  { href: "/team", label: "Team", icon: Users, adminOnly: true },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Titles for routes that exist but are not in the main nav. */
const extraTitles: Record<string, string> = {
  "/design": "Design System",
};

export function getPageTitle(pathname: string) {
  return (
    navItems.find((item) => isActivePath(pathname, item.href))?.label ?? extraTitles[pathname] ?? "Team Todo"
  );
}
