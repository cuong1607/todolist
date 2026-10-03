"use client";

import { motion } from "motion/react";
import { fadeInUp } from "@/lib/motion";

type EmptyStateProps = {
  /** An element such as `<CalendarCheck />` — Server Components can't pass component functions to Client Components. */
  icon: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
};

export function EmptyState({ icon, title, description, children }: EmptyStateProps) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center rounded-2xl border border-dashed bg-surface px-6 py-12 text-center"
    >
      <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-foreground [&_svg]:size-6">
        {icon}
      </span>
      <h3 className="text-title">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-caption text-muted-foreground">{description}</p>}
      {children && <div className="mt-5">{children}</div>}
    </motion.div>
  );
}
