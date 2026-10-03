"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const roleSchema = z.enum(["ADMIN", "EMPLOYEE"]);

const createMemberSchema = z.object({
  full_name: z.string().trim().min(1, "Vui lòng nhập họ tên").max(100, "Tối đa 100 ký tự"),
  email: z.email("Email không hợp lệ").trim().toLowerCase(),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(72, "Mật khẩu tối đa 72 ký tự"),
  role: roleSchema,
});

export type CreateMemberState = { ok?: boolean; error?: string; nonce?: number };

export async function createMember(_prev: CreateMemberState, formData: FormData): Promise<CreateMemberState> {
  await requireAdmin();

  const parsed = createMemberSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { full_name, email, password, role } = parsed.data;

  // Creating an auth user needs the Auth admin API. The on_auth_user_created
  // trigger then creates the profile as EMPLOYEE.
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error || !data.user) {
    const exists = error?.code === "email_exists" || error?.status === 422;
    return { error: exists ? "Email này đã có tài khoản" : "Không tạo được tài khoản. Thử lại sau." };
  }

  if (role === "ADMIN") {
    // Promote through the admin's own session so RLS + guard trigger still apply.
    const supabase = await createClient();
    const { error: roleError } = await supabase.from("profiles").update({ role }).eq("id", data.user.id);
    if (roleError) return { error: "Đã tạo tài khoản nhưng chưa đặt được quyền Admin." };
  }

  revalidatePath("/members");
  return { ok: true, nonce: Date.now() };
}

const memberIdSchema = z.uuid();

export type MemberActionResult = { ok: true } | { ok: false; error: string };

export async function setMemberRole(memberId: string, role: string): Promise<MemberActionResult> {
  const me = await requireAdmin();
  const id = memberIdSchema.safeParse(memberId);
  const nextRole = roleSchema.safeParse(role);
  if (!id.success || !nextRole.success) return { ok: false, error: "Dữ liệu không hợp lệ" };
  if (id.data === me.id) return { ok: false, error: "Không thể tự đổi quyền của mình" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ role: nextRole.data }).eq("id", id.data).select("id");
  if (error || data.length === 0) return { ok: false, error: "Không đổi được quyền" };

  revalidatePath("/members");
  return { ok: true };
}

export async function setMemberActive(memberId: string, active: boolean): Promise<MemberActionResult> {
  const me = await requireAdmin();
  const id = memberIdSchema.safeParse(memberId);
  if (!id.success || typeof active !== "boolean") return { ok: false, error: "Dữ liệu không hợp lệ" };
  if (id.data === me.id) return { ok: false, error: "Không thể tự khoá tài khoản của mình" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ active }).eq("id", id.data).select("id");
  if (error || data.length === 0) return { ok: false, error: "Không cập nhật được trạng thái" };

  // Also ban at the Auth level so a deactivated member can't sign in or refresh a session.
  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(id.data, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banError) return { ok: false, error: "Đã cập nhật hồ sơ nhưng chưa khoá/mở được đăng nhập" };

  revalidatePath("/members");
  return { ok: true };
}
