import type { Tables } from "@/types/database";

/** Columns the Today screen needs. Used by the page query, actions and Realtime merges. */
export const TODAY_TASK_COLUMNS =
  "id, type, title, note, allow_employee_note, employee_note, deadline_at, completed, completed_at, task_date, sort_order, created_at, assignee_id, created_by" as const;

export type TodayTask = Pick<
  Tables<"tasks">,
  | "id"
  | "type"
  | "title"
  | "note"
  | "allow_employee_note"
  | "employee_note"
  | "deadline_at"
  | "completed"
  | "completed_at"
  | "task_date"
  | "sort_order"
  | "created_at"
  | "assignee_id"
  | "created_by"
>;

/** Narrow a full row (e.g. a Realtime payload) to what the Today screen keeps. */
export function toTodayTask(row: Tables<"tasks">): TodayTask {
  const { id, type, title, note, allow_employee_note, employee_note, deadline_at, completed, completed_at, task_date, sort_order, created_at, assignee_id, created_by } = row;
  return { id, type, title, note, allow_employee_note, employee_note, deadline_at, completed, completed_at, task_date, sort_order, created_at, assignee_id, created_by };
}

/** The id of whoever handed this task to its assignee, or null when it is self-made (or FIXED). */
export function assignerOf(task: Pick<TodayTask, "type" | "assignee_id" | "created_by">): string | null {
  return task.type === "ADHOC" && task.created_by && task.created_by !== task.assignee_id ? task.created_by : null;
}
