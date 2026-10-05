"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const teamSchema = z.object({
  team_name: z.string().trim().min(1, "Vui lòng nhập tên team").max(40, "Tối đa 40 ký tự"),
});

export type SettingsFormState = { ok?: boolean; error?: string };

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
