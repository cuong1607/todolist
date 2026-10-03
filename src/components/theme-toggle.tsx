"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "motion/react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { transition } from "@/lib/motion";

const themes = [
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
  { value: "system", label: "Hệ thống", icon: Monitor },
] as const;

/** True only after hydration — the theme is unknown on the server. */
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Compact icon button that cycles light → dark → system. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const index = Math.max(0, themes.findIndex((t) => t.value === theme));
  const current = themes[index] ?? themes[0];
  const next = themes[(index + 1) % themes.length] ?? themes[0];

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className={cn("rounded-full", className)}
      onClick={() => setTheme(next.value)}
      aria-label={`Giao diện: ${current.label}. Chuyển sang ${next.label}`}
    >
      {mounted && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={current.value}
            initial={{ opacity: 0, rotate: -45, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 45, scale: 0.8 }}
            transition={transition.fast}
            className="flex"
          >
            <current.icon className="size-[1.125rem]" />
          </motion.span>
        </AnimatePresence>
      )}
    </Button>
  );
}

/** Segmented control for the settings page. */
export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <div role="radiogroup" aria-label="Giao diện" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
      {themes.map((t) => {
        const active = mounted && theme === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(t.value)}
            className={cn(
              "relative flex h-10 items-center justify-center gap-2 rounded-lg text-caption font-medium transition-colors duration-(--duration-normal)",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="theme-selector-pill"
                transition={transition.spring}
                className="absolute inset-0 rounded-lg bg-surface shadow-xs"
              />
            )}
            <t.icon className="relative size-4" />
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
