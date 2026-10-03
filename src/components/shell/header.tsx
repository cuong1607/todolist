"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getPageTitle } from "@/lib/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Brand } from "./brand";
import { UserAvatar } from "./user-avatar";
import type { ShellUser } from "./shell-user";

/**
 * Sticky header. Mobile: compact top bar with brand. Desktop: page title
 * (the brand already lives in the sidebar).
 */
export function Header({ user }: { user: ShellUser }) {
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
          <Link
            href="/profile"
            aria-label="Hồ sơ của bạn"
            className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <UserAvatar name={user.fullName} src={user.avatarUrl} />
          </Link>
        </div>
      </div>
    </header>
  );
}
