"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Vui lòng nhập họ tên").max(100, "Tối đa 100 ký tự"),
  notification_enabled: z.boolean(),
});

export type ProfileFormState = { ok?: boolean; error?: string };

export async function updateProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  // The row to update comes from the session, never from the form.
  const me = await requireUser();

  const parsed = profileSchema.safeParse({
    full_name: formData.get("full_name"),
    notification_enabled: formData.get("notification_enabled") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", me.id);
  if (error) return { error: "Không lưu được. Thử lại sau." };

  revalidatePath("/", "layout");
  return { ok: true };
}

const notificationSchema = z.object({
  daily_summary_enabled: z.boolean(),
  daily_summary_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ"),
  deadline_reminder_enabled: z.boolean(),
  remind_before_minutes: z.coerce.number().int().min(5, "Nhắc trước ít nhất 5 phút").max(1440, "Nhắc trước tối đa 1 ngày"),
  overdue_alert_enabled: z.boolean(),
});

export async function updateNotificationSettings(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const me = await requireUser();

  const parsed = notificationSchema.safeParse({
    daily_summary_enabled: formData.get("daily_summary_enabled") === "on",
    daily_summary_time: formData.get("daily_summary_time"),
    deadline_reminder_enabled: formData.get("deadline_reminder_enabled") === "on",
    remind_before_minutes: formData.get("remind_before_minutes"),
    overdue_alert_enabled: formData.get("overdue_alert_enabled") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.from("notification_settings").update(parsed.data).eq("user_id", me.id).select("user_id");
  if (error || data.length === 0) return { error: "Không lưu được. Thử lại sau." };

  revalidatePath("/profile");
  return { ok: true };
}
