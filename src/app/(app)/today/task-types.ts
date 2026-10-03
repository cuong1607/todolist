import type { Tables } from "@/types/database";

/** Columns the Today screen needs. Used by the page query, actions and Realtime merges. */
export const TODAY_TASK_COLUMNS =
  "id, type, title, note, allow_employee_note, employee_note, deadline_at, completed, completed_at, task_date, sort_order, created_at" as const;

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
>;

/** Narrow a full row (e.g. a Realtime payload) to what the Today screen keeps. */
export function toTodayTask(row: Tables<"tasks">): TodayTask {
  const { id, type, title, note, allow_employee_note, employee_note, deadline_at, completed, completed_at, task_date, sort_order, created_at } = row;
  return { id, type, title, note, allow_employee_note, employee_note, deadline_at, completed, completed_at, task_date, sort_order, created_at };
}
