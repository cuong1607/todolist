import { APP_TIMEZONE, todayLocal } from "@/lib/time";
import type { Tables } from "@/types/database";

export type DisplayStatus = "UPCOMING" | "TODAY" | "OVERDUE" | "COMPLETED";

type StatusInput = Pick<Tables<"tasks">, "type" | "status" | "due_at" | "task_date">;

function localDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date(iso));
}

/**
 * Derived status — never stored. Mirrors public.display_status() in SQL;
 * computed client-side too so "overdue" flips live while the page is open.
 */
export function deriveStatus(task: StatusInput, now = new Date()): DisplayStatus {
  const today = todayLocal(now);
  if (task.status === "DONE") return "COMPLETED";
  // A fixed task belongs to its day: missed = overdue, even without a deadline.
  if (task.type === "FIXED" && task.task_date < today) return "OVERDUE";
  if (task.due_at && new Date(task.due_at) < now) return "OVERDUE";
  // No deadline: never overdue, stays in "Việc đang tồn".
  if (!task.due_at) return "TODAY";
  return localDate(task.due_at) <= today ? "TODAY" : "UPCOMING";
}
