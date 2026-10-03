"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const templateSchema = z.object({
  id: z.uuid().optional(),
  assignee_id: z.uuid(),
  title: z.string().trim().min(1, "Vui lòng nhập tên công việc").max(200, "Tối đa 200 ký tự"),
  note: z
    .string()
    .trim()
    .max(2000, "Ghi chú tối đa 2000 ký tự")
    .transform((v) => v || null),
  allow_employee_note: z.boolean(),
  due_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ")
    .or(z.literal(""))
    .transform((v) => v || null),
  weekdays: z
    .array(z.coerce.number().int().min(1).max(7))
    .min(1, "Chọn ít nhất một ngày trong tuần")
    .transform((days) => [...new Set(days)].sort()),
});

export type TemplateFormState = { ok?: boolean; error?: string; nonce?: number };

export async function saveTemplate(_prev: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  await requireAdmin();

  const parsed = templateSchema.safeParse({
    id: formData.get("id") || undefined,
    assignee_id: formData.get("assignee_id"),
    title: formData.get("title"),
    note: formData.get("note") ?? "",
    allow_employee_note: formData.get("allow_employee_note") === "on",
    due_time: formData.get("due_time") ?? "",
    weekdays: formData.getAll("weekdays"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, ...values } = parsed.data;

  const supabase = await createClient();

  if (id) {
    // assignee is fixed once created — reassigning would break the history's meaning.
    const { title, note, allow_employee_note, due_time, weekdays } = values;
    const { error } = await supabase
      .from("fixed_task_templates")
      .update({ title, note, allow_employee_note, due_time, weekdays })
      .eq("id", id);
    if (error) return { error: "Không lưu được. Thử lại sau." };
  } else {
    const { data: last } = await supabase
      .from("fixed_task_templates")
      .select("sort_order")
      .eq("assignee_id", values.assignee_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase
      .from("fixed_task_templates")
      .insert({ ...values, sort_order: (last?.sort_order ?? 0) + 1 });
    if (error) return { error: "Không tạo được. Thử lại sau." };
  }

  // New templates that apply today show up immediately, not tomorrow.
  await supabase.rpc("ensure_today_fixed_tasks");

  revalidatePath("/fixed-tasks");
  return { ok: true, nonce: Date.now() };
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setTemplateActive(id: string, active: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success || typeof active !== "boolean") return { ok: false, error: "Dữ liệu không hợp lệ" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("fixed_task_templates").update({ active }).eq("id", id).select("id");
  if (error || data.length === 0) return { ok: false, error: "Không cập nhật được" };

  if (active) await supabase.rpc("ensure_today_fixed_tasks");

  revalidatePath("/fixed-tasks");
  return { ok: true };
}

export async function reorderTemplates(assigneeId: string, ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.object({ assigneeId: z.uuid(), ids: z.array(z.uuid()).max(200) }).safeParse({ assigneeId, ids });
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_fixed_task_templates", {
    p_assignee_id: parsed.data.assigneeId,
    p_ids: parsed.data.ids,
  });
  if (error) return { ok: false, error: "Không lưu được thứ tự" };

  revalidatePath("/fixed-tasks");
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Dữ liệu không hợp lệ" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("fixed_task_templates").delete().eq("id", id).select("id");
  // 23503 = FK violation: the template already generated tasks (history must be kept).
  if (error?.code === "23503") return { ok: false, error: "Việc này đã có lịch sử. Hãy tắt thay vì xoá." };
  if (error || data.length === 0) return { ok: false, error: "Không xoá được" };

  revalidatePath("/fixed-tasks");
  return { ok: true };
}
