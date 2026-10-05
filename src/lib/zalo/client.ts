import "server-only";
import { z } from "zod";
import type { ZaloConfig } from "./config";
import { ZaloError, toZaloError, zaloApiError } from "./errors";
import { getAccessToken } from "./tokens";

const TIMEOUT_MS = 10_000;
/** Zalo's limit for a text message. */
export const MAX_TEXT_LENGTH = 2000;

/** Every OpenAPI response is { error: 0, message, data } on success, non-zero `error` otherwise. */
const envelopeSchema = z.object({
  error: z.coerce.number(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

async function call(config: ZaloConfig, path: string, init: { method: "GET" | "POST"; body?: unknown }, accessToken: string) {
  let json: unknown;
  let status: number;
  try {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: init.method,
      headers: { access_token: accessToken, ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    status = response.status;
    json = await response.json();
  } catch (error) {
    throw new ZaloError("NETWORK", error instanceof Error ? error.message : undefined);
  }

  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) throw new ZaloError("NETWORK", `phản hồi không hợp lệ (HTTP ${status})`);
  if (envelope.data.error !== 0) throw zaloApiError(envelope.data.error, envelope.data.message);
  return envelope.data.data;
}

/** Call the OA API; if the access token is rejected, refresh it once and try again. */
async function request(config: ZaloConfig, path: string, init: { method: "GET" | "POST"; body?: unknown }) {
  try {
    return await call(config, path, init, await getAccessToken(config));
  } catch (error) {
    const zaloError = toZaloError(error);
    if (zaloError.kind !== "AUTH") throw zaloError;
    return call(config, path, init, await getAccessToken(config, { forceRefresh: true }));
  }
}

/**
 * Send a "tư vấn" (customer-service) text message to one follower.
 * POST /v3.0/oa/message/cs — Zalo only delivers these to users who interacted with the OA recently.
 */
export async function sendText(config: ZaloConfig, zaloUserId: string, text: string): Promise<{ messageId: string }> {
  const data = await request(config, "/v3.0/oa/message/cs", {
    method: "POST",
    body: { recipient: { user_id: zaloUserId }, message: { text: text.slice(0, MAX_TEXT_LENGTH) } },
  });
  const parsed = z.object({ message_id: z.coerce.string().min(1) }).safeParse(data);
  if (!parsed.success) throw new ZaloError("NETWORK", "Zalo không trả về message_id");
  return { messageId: parsed.data.message_id };
}

/** The connected OA's public identity — also a cheap way to check the tokens still work. */
export async function getOaInfo(config: ZaloConfig): Promise<{ oaId: string | null; name: string | null }> {
  const data = await request(config, "/v2.0/oa/getoa", { method: "GET" });
  const parsed = z.object({ oa_id: z.coerce.string().optional(), name: z.string().optional() }).safeParse(data);
  return { oaId: parsed.success ? (parsed.data.oa_id ?? null) : null, name: parsed.success ? (parsed.data.name ?? null) : null };
}
