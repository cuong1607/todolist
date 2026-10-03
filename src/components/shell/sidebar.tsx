"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { LogOut } from "lucide-react";
import { navByRole, isActivePath } from "@/lib/navigation";
import { transition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";
import { Brand } from "./brand";
import { UserAvatar } from "./user-avatar";
import type { ShellUser } from "./shell-user";

/** Desktop-only navigation (md and up). */
export function Sidebar({ user }: { user: ShellUser }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r bg-sidebar md:flex">
      <div className="flex h-topbar items-center px-5">
        <Brand />
      </div>

      <nav aria-label="Điều hướng chính" className="flex flex-1 flex-col gap-1 px-3 py-4">
        {navByRole[user.role].map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors duration-(--duration-normal) focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "text-primary-soft-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  transition={transition.spring}
                  className="absolute inset-0 rounded-lg bg-primary-soft"
                />
              )}
              <item.icon className="relative size-[1.125rem]" />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 border-t p-3">
        <Link
          href="/profile"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 outline-none transition-colors duration-(--duration-normal) hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <UserAvatar name={user.fullName} src={user.avatarUrl} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{user.fullName}</span>
            <span className="block truncate text-micro text-muted-foreground">
              {user.role === "ADMIN" ? "Admin" : "Nhân viên"}
            </span>
          </span>
        </Link>
        <form action={logout}>
          <button
            type="submit"
            aria-label="Đăng xuất"
            title="Đăng xuất"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors duration-(--duration-normal) hover:bg-danger-soft hover:text-danger-soft-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <LogOut className="size-[1.125rem]" />
          </button>
        </form>
      </div>
    </aside>
  );
}
