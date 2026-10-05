import "server-only";
import { readPayload } from "@/lib/notifications";
import { createServiceClient } from "@/lib/supabase/service";
import { toZaloError } from "./errors";
import { sendNotification } from "./provider";

export type DispatchResult = { claimed: number; sent: number; retrying: number; failed: number };

/**
 * The Zalo worker: drain due ZALO rows from the notification queue.
 * The engine (Phase 9) decided what to send and when; this only delivers, through
 * claim → sendNotification → complete | fail. Safe to run concurrently (claim uses SKIP LOCKED).
 */
export async function dispatchZaloNotifications(limit = 20): Promise<DispatchResult> {
  const supabase = createServiceClient();
  const result: DispatchResult = { claimed: 0, sent: 0, retrying: 0, failed: 0 };

  const { data: rows, error } = await supabase.rpc("claim_notifications", { p_provider: "ZALO", p_limit: limit });
  if (error) throw new Error(`claim_notifications: ${error.message}`);
  result.claimed = rows.length;
  if (rows.length === 0) return result;

  // Rows queued before an admin switched the channel off must not go out afterwards.
  const { data: setting } = await supabase.from("system_settings").select("value").eq("key", "zalo_enabled").maybeSingle();
  const channelOn = setting?.value === true;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, zalo_user_id, zalo_connected, active, notification_enabled")
    .in("id", [...new Set(rows.map((r) => r.user_id))]);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  // One at a time: a team's worth of messages is small, and it keeps us well inside Zalo's rate limits.
  for (const row of rows) {
    const profile = byId.get(row.user_id);
    // Things may have changed since the row was queued.
    let blocked: string | null = null;
    if (!channelOn) blocked = "Zalo OA đang tắt";
    else if (!profile?.active) blocked = "Tài khoản đã bị khoá";
    else if (!profile.notification_enabled) blocked = "Thành viên đã tắt thông báo";
    else if (!profile.zalo_connected || !profile.zalo_user_id) blocked = "Thành viên chưa liên kết Zalo";

    if (blocked || !profile) {
      await supabase.rpc("fail_notification", { p_id: row.id, p_error: blocked ?? "Không tìm thấy thành viên", p_final: true });
      result.failed++;
      continue;
    }

    try {
      const { externalMessageId } = await sendNotification({ id: row.user_id, zaloUserId: profile.zalo_user_id }, readPayload(row.payload));
      await supabase.rpc("complete_notification", { p_id: row.id, p_external_message_id: externalMessageId });
      result.sent++;
    } catch (error) {
      const zaloError = toZaloError(error);
      const { data: status } = await supabase.rpc("fail_notification", { p_id: row.id, p_error: zaloError.message, p_final: !zaloError.retryable });
      if (status === "PENDING") result.retrying++;
      else result.failed++;
    }
  }

  return result;
}
