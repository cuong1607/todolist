"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getTeamName } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { toZaloError } from "@/lib/zalo/errors";
import { sendNotification } from "@/lib/zalo/provider";
import { clearTokens } from "@/lib/zalo/tokens";

export type ZaloActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Master switch for the channel: while off, the engine queues no ZALO rows and the worker sends none. */
export async function setZaloEnabled(enabled: boolean): Promise<ZaloActionResult> {
  await requireAdmin();
  if (typeof enabled !== "boolean") return { ok: false, error: "Dữ liệu không hợp lệ" };

  const supabase = await createClient();
  if (enabled) {
    const { data: status } = await supabase.rpc("zalo_status");
    const connected = z.object({ connected: z.boolean() }).safeParse(status);
    if (!connected.success || !connected.data.connected) return { ok: false, error: "Hãy kết nối Zalo OA trước khi bật" };
  }

  const { error } = await supabase.from("system_settings").upsert({ key: "zalo_enabled", value: enabled, description: "Bật gửi thông báo qua Zalo OA" });
  if (error) return { ok: false, error: "Không lưu được. Thử lại sau." };

  revalidatePath("/settings/zalo");
  revalidatePath("/profile");
  return { ok: true };
}

/** Forget the OA: drop the tokens and switch the channel off. Members stay linked for a later reconnect. */
export async function disconnectZalo(): Promise<ZaloActionResult> {
  await requireAdmin();
  try {
    await clearTokens();
  } catch {
    return { ok: false, error: "Không ngắt được kết nối. Thử lại sau." };
  }

  const supabase = await createClient();
  await supabase.from("system_settings").upsert([
    { key: "zalo_enabled", value: false },
    { key: "zalo_oa_id", value: "" },
    { key: "zalo_oa_name", value: "" },
  ]);

  revalidatePath("/settings/zalo");
  revalidatePath("/profile");
  return { ok: true };
}

/** Admin removes a member's Zalo link (e.g. they linked the wrong account). */
export async function unlinkMemberZalo(userId: string): Promise<ZaloActionResult> {
  await requireAdmin();
  const id = z.uuid().safeParse(userId);
  if (!id.success) return { ok: false, error: "Dữ liệu không hợp lệ" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("zalo_unlink", { p_user_id: id.data });
  if (error) return { ok: false, error: "Không gỡ được liên kết" };

  revalidatePath("/settings/zalo");
  return { ok: true };
}

/**
 * Send a test message to one member's Zalo, right now, through the same provider the
 * engine uses — and record it in notification_logs like any other notification.
 */
export async function sendZaloTest(userId: string): Promise<ZaloActionResult> {
  const admin = await requireAdmin();
  const id = z.uuid().safeParse(userId);
  if (!id.success) return { ok: false, error: "Hãy chọn một thành viên" };

  const supabase = await createClient();
  const { data: member } = await supabase.from("profiles").select("id, full_name, email, zalo_user_id, zalo_connected").eq("id", id.data).maybeSingle();
  if (!member) return { ok: false, error: "Không tìm thấy thành viên" };
  if (!member.zalo_connected || !member.zalo_user_id) return { ok: false, error: "Thành viên này chưa liên kết Zalo" };

  const name = member.full_name || member.email;
  const payload = {
    title: "Tin nhắn thử",
    body: `Xin chào ${name}! Đây là tin nhắn thử từ ${await getTeamName()}, gửi bởi ${admin.full_name || admin.email}.`,
    url: "/today",
  };

  // Written as PROCESSING by the job client: clients cannot insert logs, and the scheduler must not pick it up.
  const service = createServiceClient();
  const { data: log, error: logError } = await service
    .from("notification_logs")
    .insert({ user_id: member.id, type: "TEST", provider: "ZALO", status: "PROCESSING", claimed_at: new Date().toISOString(), payload })
    .select("id")
    .single();
  if (logError) return { ok: false, error: "Không ghi được nhật ký. Thử lại sau." };

  try {
    const { externalMessageId } = await sendNotification({ id: member.id, zaloUserId: member.zalo_user_id }, payload);
    await service.rpc("complete_notification", { p_id: log.id, p_external_message_id: externalMessageId });
    revalidatePath("/settings/zalo");
    return { ok: true, message: `Đã gửi tin thử tới Zalo của ${name}` };
  } catch (error) {
    const zaloError = toZaloError(error);
    await service.rpc("fail_notification", { p_id: log.id, p_error: zaloError.message, p_final: true });
    revalidatePath("/settings/zalo");
    return { ok: false, error: zaloError.message };
  }
}
