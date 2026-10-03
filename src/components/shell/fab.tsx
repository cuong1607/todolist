"use client";

import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { transition } from "@/lib/motion";

type FabProps = {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
};

/**
 * Mobile floating action button, sitting above the bottom nav.
 * Render it only on pages with one obvious primary action.
 */
export function Fab({ icon: Icon, label, onClick }: FabProps) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileTap={{ scale: 0.9 }}
      transition={transition.spring}
      className="fixed right-gutter bottom-[calc(var(--bottomnav-height)+env(safe-area-inset-bottom)+1rem)] z-30 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-raised outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
    >
      <Icon className="size-6" />
    </motion.button>
  );
}
