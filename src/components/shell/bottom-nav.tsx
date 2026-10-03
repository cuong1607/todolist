"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { navByRole, isActivePath, type Role } from "@/lib/navigation";
import { transition } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Mobile-only tab bar (below md). */
export function BottomNav({ role }: { role: Role }) {
  const items = navByRole[role];
  const pathname = usePathname();

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface/90 pb-safe backdrop-blur-lg md:hidden"
    >
      <ul className="mx-auto grid h-bottomnav max-w-md" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-micro font-medium outline-none transition-colors duration-(--duration-normal)",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative flex h-8 w-14 items-center justify-center">
                  {active && (
                    <motion.span
                      layoutId="bottom-nav-active"
                      transition={transition.spring}
                      className="absolute inset-0 rounded-full bg-primary-soft"
                    />
                  )}
                  <motion.span whileTap={{ scale: 0.85 }} transition={transition.fast} className="relative flex">
                    <item.icon className="size-5" />
                  </motion.span>
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
