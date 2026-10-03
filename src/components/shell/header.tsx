"use client";

import { usePathname } from "next/navigation";
import { getPageTitle } from "@/lib/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Brand } from "./brand";
import { UserAvatar } from "./user-avatar";

/**
 * Sticky header. Mobile: compact top bar with brand. Desktop: page title
 * (the brand already lives in the sidebar).
 */
export function Header() {
  const title = getPageTitle(usePathname());

  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 pt-safe backdrop-blur-lg">
      <div className="mx-auto flex h-topbar w-full max-w-5xl items-center justify-between gap-3 px-gutter md:px-8">
        <div className="md:hidden">
          <Brand />
        </div>
        <h1 className="hidden text-title md:block">{title}</h1>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserAvatar />
        </div>
      </div>
    </header>
  );
}
