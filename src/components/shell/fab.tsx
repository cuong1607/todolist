"use client";

import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { transition } from "@/lib/motion";
import { cn } from "@/lib/utils";

type FabProps = {
  icon: LucideIcon;
  label: string;
  /** Show the label next to the icon (pill). Use for the screen's single primary action. */
  extended?: boolean;
  onClick?: () => void;
};

/**
 * Mobile floating action button, sitting above the bottom nav in the thumb zone.
 * Render it only on pages with one obvious primary action.
 */
export function Fab({ icon: Icon, label, extended = false, onClick }: FabProps) {
  return (
    <>
      {/* Spacer so the last card can scroll clear of the floating button. */}
      <div aria-hidden className="h-20 md:hidden" />
      <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileTap={{ scale: 0.92 }}
      transition={transition.spring}
      className={cn(
        "fixed right-gutter bottom-[calc(var(--bottomnav-height)+env(safe-area-inset-bottom)+1rem)] z-30 flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground shadow-raised outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden",
        extended ? "px-5 text-body font-semibold" : "w-14",
      )}
    >
        <Icon className="size-6" />
        {extended && <span>{label}</span>}
      </motion.button>
    </>
  );
}
