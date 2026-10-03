"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toDeadlineISO } from "@/lib/time";
import { TODAY_TASK_COLUMNS, type TodayTask } from "./task-types";

const adhocSchema = z
  .object({
    title: z.string().trim().min(1, "Vui lòng nhập tên công việc").max(200, "Tối đa 200 ký tự"),
    note: z
      .string()
      .trim()
      .max(2000, "Ghi chú tối đa 2000 ký tự")
      .transform((v) => v || null),
    due_date: z.union([z.literal(""), z.iso.date("Ngày không hợp lệ")]),
    due_time: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ")]),
  })
  .transform(({ due_date, due_time, ...rest }) => ({
    ...rest,
    deadline_at: due_date ? toDeadlineISO(due_date, due_time) : null,
  }));

function parse(formData: FormData) {
  return adhocSchema.safeParse({
    title: formData.get("title") ?? "",
    note: formData.get("note") ?? "",
    due_date: formData.get("due_date") ?? "",
    due_time: formData.get("due_time") ?? "",
  });
}

/** `task` is returned so the Today screen can merge it without re-rendering the page. */
export type AdhocFormState = { ok?: boolean; error?: string; nonce?: number; task?: TodayTask };

export async function createAdhocTask(_prev: AdhocFormState, formData: FormData): Promise<AdhocFormState> {
  await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // No assignee_id / task_date / created_by here: the DB fills them from the session
  // and the insert guard rejects anything else.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({ type: "ADHOC", ...parsed.data })
    .select(TODAY_TASK_COLUMNS)
    .single();
  if (error) return { error: error.code === "42501" ? error.message : "Không tạo được. Thử lại sau." };

  return { ok: true, nonce: Date.now(), task: data };
}

export async function updateAdhocTask(_prev: AdhocFormState, formData: FormData): Promise<AdhocFormState> {
  await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = parse(formData);
  if (!id.success) return { error: "Dữ liệu không hợp lệ" };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(parsed.data)
    .eq("id", id.data)
    .eq("type", "ADHOC")
    .select(TODAY_TASK_COLUMNS)
    .maybeSingle();
  if (error) return { error: error.code === "42501" ? error.message : "Không lưu được. Thử lại sau." };
  if (!data) return { error: "Không tìm thấy công việc" };

  return { ok: true, nonce: Date.now(), task: data };
}
