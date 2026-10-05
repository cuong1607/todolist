import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { getZaloConfig } from "@/lib/zalo/config";
import { sendText } from "@/lib/zalo/client";
import { verifyWebhookSignature } from "@/lib/zalo/signature";

export const dynamic = "force-dynamic";

/** The fields we use; Zalo sends more. `timestamp` is part of the signature. */
const eventSchema = z.object({
  app_id: z.coerce.string(),
  event_name: z.string(),
  timestamp: z.coerce.string(),
  sender: z.object({ id: z.coerce.string().min(1) }).optional(),
  message: z.object({ text: z.string().optional() }).optional(),
});

/** A link code from zalo_create_link_code(): 8 characters, no look-alikes, anywhere in the message. */
const LINK_CODE = /(?<![A-Z0-9])[A-HJ-KM-NP-Z2-9]{8}(?![A-Z0-9])/;

/** Zalo checks that the URL answers before it lets you save it. */
export function GET() {
  return new Response("ok");
}

/**
 * Zalo OA webhook. Its one job: when a member sends their link code to the OA,
 * attach the sender's Zalo user id to that member's profile.
 */
export async function POST(request: Request) {
  const config = getZaloConfig();
  if (!config) return Response.json({ error: "zalo_not_configured" }, { status: 503 });

  const rawBody = await request.text();
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid_event" }, { status: 400 });
  const event = parsed.data;

  const signed = verifyWebhookSignature({
    rawBody,
    timestamp: event.timestamp,
    header: request.headers.get("x-zevent-signature"),
    appId: config.appId,
    oaSecretKey: config.oaSecretKey,
  });
  if (!signed || event.app_id !== config.appId) {
    console.warn(JSON.stringify({ event: "zalo.webhook.rejected", reason: signed ? "app_id" : "signature", name: event.event_name }));
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  // From here on always answer 200: anything else makes Zalo retry the same event.
  if (event.event_name === "user_send_text" && event.sender) {
    const code = event.message?.text?.toUpperCase().match(LINK_CODE)?.[0];
    if (code) await linkMember(config, code, event.sender.id);
  }
  return Response.json({ ok: true });
}

async function linkMember(config: NonNullable<ReturnType<typeof getZaloConfig>>, code: string, zaloUserId: string) {
  const { data, error } = await createServiceClient().rpc("zalo_link_by_code", { p_code: code, p_zalo_user_id: zaloUserId });
  if (error) {
    console.error("zalo_link_by_code failed", error.message);
    return;
  }
  const result = z.object({ status: z.enum(["linked", "invalid", "taken"]), full_name: z.string().nullish() }).safeParse(data);
  if (!result.success) return;

  console.info(JSON.stringify({ event: "zalo.link", status: result.data.status }));
  const reply = {
    linked: `Đã kết nối Zalo với tài khoản ${result.data.full_name || "của bạn"}. Từ giờ bạn sẽ nhận nhắc việc tại đây.`,
    invalid: "Mã kết nối không đúng hoặc đã hết hạn. Hãy mở mục Tài khoản trong ứng dụng để lấy mã mới.",
    taken: "Tài khoản Zalo này đã được liên kết với một thành viên khác.",
  }[result.data.status];

  // The reply is a courtesy; the link itself is already saved.
  try {
    await sendText(config, zaloUserId, reply);
  } catch (replyError) {
    console.warn("zalo link reply failed", replyError instanceof Error ? replyError.message : replyError);
  }
}
