import "server-only";
import { getZaloConfig } from "./config";
import { sendText } from "./client";
import { ZaloError, toZaloError } from "./errors";

export type NotificationRecipient = {
  /** profiles.id — for logs only. */
  id: string;
  /** profiles.zalo_user_id: the member's id as this OA sees them. */
  zaloUserId: string | null;
};

export type NotificationPayload = { title: string; body: string; url: string | null };

/**
 * The Zalo provider. Callers hand over who and what; this function owns the rest:
 * calling the Zalo API, reading its response, logging the outcome and turning any
 * failure into a ZaloError (`kind`, `retryable`, Zalo's code).
 */
export async function sendNotification(user: NotificationRecipient, payload: NotificationPayload): Promise<{ externalMessageId: string }> {
  const startedAt = Date.now();
  try {
    const config = getZaloConfig();
    if (!config) throw new ZaloError("NOT_CONFIGURED");
    if (!user.zaloUserId) throw new ZaloError("REJECTED", "thành viên chưa liên kết Zalo");

    // Plain text: title line, body, then a link back into the app.
    const text = [payload.title, payload.body, payload.url ? `${config.appUrl}${payload.url}` : null].filter(Boolean).join("\n");
    const { messageId } = await sendText(config, user.zaloUserId, text);

    console.info(JSON.stringify({ event: "zalo.sent", user: user.id, messageId, ms: Date.now() - startedAt }));
    return { externalMessageId: messageId };
  } catch (error) {
    const zaloError = toZaloError(error);
    console.warn(
      JSON.stringify({
        event: "zalo.failed",
        user: user.id,
        kind: zaloError.kind,
        zaloCode: zaloError.zaloCode,
        retryable: zaloError.retryable,
        message: zaloError.message,
        ms: Date.now() - startedAt,
      }),
    );
    throw zaloError;
  }
}
