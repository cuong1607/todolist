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
