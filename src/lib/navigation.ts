import {
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  LayoutDashboard,
  LayoutList,
  Repeat,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Role = "ADMIN" | "EMPLOYEE";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Each role gets its own navigation — employees see "my day", admins see "the team". */
export const navByRole: Record<Role, NavItem[]> = {
  EMPLOYEE: [
    { href: "/today", label: "Hôm nay", icon: CalendarCheck },
    { href: "/calendar", label: "Lịch", icon: CalendarDays },
    { href: "/tasks", label: "Công việc", icon: LayoutList },
    { href: "/profile", label: "Tài khoản", icon: UserRound },
  ],
  ADMIN: [
    { href: "/overview", label: "Tổng quan", icon: LayoutDashboard },
    { href: "/fixed-tasks", label: "Việc cố định", icon: Repeat },
    { href: "/reports", label: "Báo cáo", icon: ChartColumn },
    { href: "/members", label: "Thành viên", icon: Users },
    { href: "/settings", label: "Cài đặt", icon: Settings },
  ],
};

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const titles: Record<string, string> = {
  "/today": "Hôm nay",
  "/calendar": "Lịch",
  "/tasks": "Công việc",
  "/profile": "Tài khoản",
  "/overview": "Tổng quan",
  "/reports": "Báo cáo",
  "/members": "Thành viên",
  "/fixed-tasks": "Việc cố định",
  "/settings": "Cài đặt",
  "/design": "Design System",
};

export function getPageTitle(pathname: string) {
  const match = Object.keys(titles).find((href) => isActivePath(pathname, href));
  return match ? titles[match] : "Team Todo";
}
