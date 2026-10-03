"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type TaskActionResult = { ok: true } | { ok: false; error: string };

// Which tasks a user may touch is decided by RLS + the guard trigger
// (own tasks, today only, only status/employee_note). We just pass the intent.

export async function setTaskDone(taskId: string, done: boolean): Promise<TaskActionResult> {
  await requireUser();
  if (!z.uuid().safeParse(taskId).success || typeof done !== "boolean") return { ok: false, error: "Dữ liệu không hợp lệ" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: done ? "DONE" : "TODO" })
    .eq("id", taskId)
    .select("id");
  if (error || data.length === 0) return { ok: false, error: userMessage(error, "Không cập nhật được") };

  revalidatePath("/today");
  return { ok: true };
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
    .select("id");
  if (error || data.length === 0) return { ok: false, error: userMessage(error, "Không lưu được ghi chú") };

  revalidatePath("/today");
  return { ok: true };
}

/** Guard-trigger errors (42501) carry a Vietnamese message meant for users; hide anything else. */
function userMessage(error: { code?: string; message: string } | null, fallback: string) {
  return error?.code === "42501" ? error.message : fallback;
}