"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email("Email không hợp lệ").trim().toLowerCase(),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export type LoginState = { error?: string; email?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Banned (deactivated) users get a distinct message; everything else is generic on purpose.
    const message = error.code === "user_banned" ? "Tài khoản đã bị khoá. Liên hệ admin." : "Email hoặc mật khẩu không đúng";
    return { error: message, email };
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
