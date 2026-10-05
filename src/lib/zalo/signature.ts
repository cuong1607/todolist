import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Zalo signs each webhook call:
 *   X-ZEvent-Signature: mac=sha256(appId + rawBody + timestamp + OA secret key)
 * where `timestamp` is the `timestamp` field of the JSON body. Verify against the RAW body —
 * re-serialising the JSON would change the bytes.
 */
export function verifyWebhookSignature(input: { rawBody: string; timestamp: string; header: string | null; appId: string; oaSecretKey: string }) {
  if (!input.header) return false;
  const received = input.header.trim().replace(/^mac=/i, "").toLowerCase();
  const expected = createHash("sha256").update(input.appId + input.rawBody + input.timestamp + input.oaSecretKey, "utf8").digest("hex");

  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
