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

export type ZaloLinkResult = { ok: true; code?: string } | { ok: false; error: string };

/** A one-time code the member sends to the OA in Zalo; the webhook then links their account. */
export async function createZaloLinkCode(): Promise<ZaloLinkResult> {
  await requireUser();
  const supabase = await createClient();
  // The RPC takes the user from the session — there is nothing to pass.
  const { data, error } = await supabase.rpc("zalo_create_link_code");
  if (error || !data) return { ok: false, error: "Không tạo được mã. Thử lại sau." };
  return { ok: true, code: data };
}

export async function unlinkZalo(): Promise<ZaloLinkResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("zalo_unlink");
  if (error) return { ok: false, error: "Không ngắt được kết nối. Thử lại sau." };
  revalidatePath("/profile");
  return { ok: true };
}

const notificationSchema = z.object({
  daily_summary_enabled: z.boolean(),
  deadline_reminder_enabled: z.boolean(),
  remind_before_minutes: z.coerce.number().int().min(5, "Nhắc trước ít nhất 5 phút").max(1440, "Nhắc trước tối đa 1 ngày"),
  overdue_alert_enabled: z.boolean(),
  end_of_day_summary_enabled: z.boolean(),
});

export async function updateNotificationSettings(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const me = await requireUser();

  const parsed = notificationSchema.safeParse({
    daily_summary_enabled: formData.get("daily_summary_enabled") === "on",
    deadline_reminder_enabled: formData.get("deadline_reminder_enabled") === "on",
    remind_before_minutes: formData.get("remind_before_minutes"),
    overdue_alert_enabled: formData.get("overdue_alert_enabled") === "on",
    end_of_day_summary_enabled: formData.get("end_of_day_summary_enabled") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.from("notification_settings").update(parsed.data).eq("user_id", me.id).select("user_id");
  if (error || data.length === 0) return { error: "Không lưu được. Thử lại sau." };

  revalidatePath("/profile");
  return { ok: true };
}
