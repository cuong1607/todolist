"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { isDeadlineReminderMinutes } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

const teamSchema = z.object({
  team_name: z.string().trim().min(1, "Vui lòng nhập tên team").max(40, "Tối đa 40 ký tự"),
});

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ");
const summaryTimesSchema = z.object({
  morning_summary_time: time,
  end_of_day_summary_time: time,
  admin_daily_summary_time: time,
  admin_daily_summary_enabled: z.boolean(),
  deadline_reminder_minutes: z.coerce.number().refine(isDeadlineReminderMinutes, "Thời gian nhắc không hợp lệ"),
});

export type SettingsFormState = { ok?: boolean; error?: string };

/** The team's notification schedule (read back by private.notification_schedule(), which every scheduler uses). */
export async function updateSummaryTimes(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  await requireAdmin();

  const parsed = summaryTimesSchema.safeParse({
    morning_summary_time: formData.get("morning_summary_time"),
    end_of_day_summary_time: formData.get("end_of_day_summary_time"),
    admin_daily_summary_time: formData.get("admin_daily_summary_time"),
    admin_daily_summary_enabled: formData.get("admin_daily_summary_enabled") === "on",
    deadline_reminder_minutes: formData.get("deadline_reminder_minutes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("system_settings").upsert(
    Object.entries(parsed.data).map(([key, value]) => ({ key, value })),
  );
  if (error) return { error: "Không lưu được. Thử lại sau." };

  revalidatePath("/settings");
  // Members see the morning time and the reminder lead time next to their on/off switches.
  revalidatePath("/profile");
  return { ok: true };
}

export async function updateTeamSettings(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  await requireAdmin();

  const parsed = teamSchema.safeParse({ team_name: formData.get("team_name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // RLS allows only admins to write; updated_by/updated_at are stamped by trigger.
  const supabase = await createClient();
  const { error } = await supabase
    .from("system_settings")
    .upsert({ key: "team_name", value: parsed.data.team_name, description: "Tên hiển thị của team" });
  if (error) return { error: "Không lưu được. Thử lại sau." };

  // The name shows in the shell on every page.
  revalidatePath("/", "layout");
  return { ok: true };
}
