"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const teamSchema = z.object({
  team_name: z.string().trim().min(1, "Vui lòng nhập tên team").max(40, "Tối đa 40 ký tự"),
});

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ");
const summaryTimesSchema = z.object({ morning_summary_time: time, end_of_day_summary_time: time, admin_daily_summary_time: time });

export type SettingsFormState = { ok?: boolean; error?: string };

/** When the scheduler sends the daily summaries (read by the private.schedule_* functions). */
export async function updateSummaryTimes(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  await requireAdmin();

  const parsed = summaryTimesSchema.safeParse({
    morning_summary_time: formData.get("morning_summary_time"),
    end_of_day_summary_time: formData.get("end_of_day_summary_time"),
    admin_daily_summary_time: formData.get("admin_daily_summary_time"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("system_settings").upsert(
    Object.entries(parsed.data).map(([key, value]) => ({ key, value })),
  );
  if (error) return { error: "Không lưu được. Thử lại sau." };

  revalidatePath("/settings");
  // Members see the morning time next to their on/off switch.
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
