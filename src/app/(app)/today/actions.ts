"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TODAY_TASK_COLUMNS, type TodayTask } from "./task-types";

export type TaskActionResult = { ok: true; task: TodayTask } | { ok: false; error: string };

// Which tasks a user may touch is decided by RLS + the guard trigger
// (own tasks; FIXED: today only, completed/employee_note; ADHOC: any day). We just pass the intent.
// No revalidatePath: the Today screen owns its state (optimistic + Realtime), so ticking
// never re-renders the page.

export async function setTaskDone(taskId: string, done: boolean): Promise<TaskActionResult> {
  await requireUser();
  if (!z.uuid().safeParse(taskId).success || typeof done !== "boolean") return { ok: false, error: "Dữ liệu không hợp lệ" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ completed: done })
    .eq("id", taskId)
    .select(TODAY_TASK_COLUMNS)
    .maybeSingle();
  if (error || !data) return { ok: false, error: userMessage(error, "Không cập nhật được") };

  return { ok: true, task: data };
}

const noteSchema = z
  .string()
  .trim()
  .max(1000, "Ghi chú tối đa 1000 ký tự")
  .transform((v) => v || null);

export async function saveTaskNote(taskId: string, note: string): Promise<TaskActionResult> {
  await requireUser();
  const id = z.uuid().safeParse(taskId);
  const parsed = noteSchema.safeParse(note);
  if (!id.success) return { ok: false, error: "Dữ liệu không hợp lệ" };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ghi chú không hợp lệ" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ employee_note: parsed.data })
    .eq("id", id.data)
    .select(TODAY_TASK_COLUMNS)
    .maybeSingle();
  if (error || !data) return { ok: false, error: userMessage(error, "Không lưu được ghi chú") };

  return { ok: true, task: data };
}

/**
 * Hand an ad-hoc task to another member. Every rule (who may, ADHOC only, not completed, active
 * receiver) lives in the `transfer_task` RPC — `assignee_id` cannot be updated any other way.
 */
export async function transferTask(taskId: string, newAssigneeId: string): Promise<TaskActionResult> {
  await requireUser();
  const args = z.object({ p_task_id: z.uuid(), p_new_assignee_id: z.uuid() }).safeParse({ p_task_id: taskId, p_new_assignee_id: newAssigneeId });
  if (!args.success) return { ok: false, error: "Dữ liệu không hợp lệ" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_task", args.data).select(TODAY_TASK_COLUMNS).maybeSingle();
  if (error || !data) return { ok: false, error: userMessage(error, "Không chuyển được công việc") };

  return { ok: true, task: data };
}

/** Guard-trigger errors (42501) carry a Vietnamese message meant for users; hide anything else. */
function userMessage(error: { code?: string; message: string } | null, fallback: string) {
  return error?.code === "42501" ? error.message : fallback;
}
