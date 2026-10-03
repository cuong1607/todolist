import { localDateOf, todayLocal } from "@/lib/time";
import type { Tables } from "@/types/database";

export type DisplayStatus = Tables<"tasks">["display_status"] & string;

type StatusInput = Pick<Tables<"tasks">, "type" | "completed" | "deadline_at" | "task_date">;

/**
 * Derived status — never stored. Mirrors public.display_status() in SQL;
 * computed client-side too so "overdue" flips live while the page is open.
 */
export function deriveStatus(task: StatusInput, now = new Date()): DisplayStatus {
  const today = todayLocal(now);
  if (task.completed) return "COMPLETED";
  // A fixed task belongs to its day: missed = overdue, even without a deadline.
  if (task.type === "FIXED" && task.task_date !== null && task.task_date < today) return "OVERDUE";
  if (task.deadline_at && new Date(task.deadline_at) < now) return "OVERDUE";
  // No deadline: never overdue, stays in "Việc đang tồn".
  if (!task.deadline_at) return "TODAY";
  return localDateOf(task.deadline_at) <= today ? "TODAY" : "UPCOMING";
}
