"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { navItems, isActivePath } from "@/lib/navigation";
import { transition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";

/** Desktop-only navigation (md and up). */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r bg-sidebar md:flex">
      <div className="flex h-topbar items-center px-5">
        <Brand />
      </div>

      <nav aria-label="Điều hướng chính" className="flex flex-1 flex-col gap-1 px-3 py-4">
        {navItems.map((item) => {
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
    </aside>
  );
}
