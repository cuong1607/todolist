/**
 * Every failure of the Zalo provider is thrown as a ZaloError, so callers decide
 * what to do from `kind` / `retryable` instead of parsing Zalo's responses.
 */
export type ZaloErrorKind =
  /** Server env is incomplete. */
  | "NOT_CONFIGURED"
  /** No OA tokens, or the refresh token was rejected — an admin must reconnect. */
  | "NOT_CONNECTED"
  /** The access token was rejected (the client refreshes and retries once before giving up). */
  | "AUTH"
  /** The OA has not granted this app the permission the API needs — fixed in the Zalo console, then reconnect. */
  | "PERMISSION"
  /** Zalo accepted the call but refused this message/recipient. Retrying will not help. */
  | "REJECTED"
  /** Quota or rate limit — try again later. */
  | "QUOTA"
  /** Timeout, DNS, 5xx, unreadable response — try again later. */
  | "NETWORK";

const USER_MESSAGES: Record<ZaloErrorKind, string> = {
  NOT_CONFIGURED: "Máy chủ chưa cấu hình Zalo OA",
  NOT_CONNECTED: "Chưa kết nối Zalo OA (hoặc phiên đã hết hạn) — cần kết nối lại",
  AUTH: "Zalo từ chối access token",
  PERMISSION: "Zalo OA chưa cấp quyền này cho ứng dụng — cấp quyền ở Zalo for Developers rồi bấm Kết nối lại",
  REJECTED: "Zalo từ chối tin nhắn",
  QUOTA: "Zalo OA đã hết hạn mức gửi tin",
  NETWORK: "Không gọi được Zalo",
};

export class ZaloError extends Error {
  readonly kind: ZaloErrorKind;
  /** Zalo's own error code, when the failure came from an API response. */
  readonly zaloCode: number | null;
  readonly retryable: boolean;

  constructor(kind: ZaloErrorKind, detail?: string, zaloCode: number | null = null) {
    // e.g. "Zalo từ chối tin nhắn: User has not interacted… (mã -230)"
    super([USER_MESSAGES[kind], detail].filter(Boolean).join(": ") + (zaloCode === null ? "" : ` (mã ${zaloCode})`));
    this.name = "ZaloError";
    this.kind = kind;
    this.zaloCode = zaloCode;
    this.retryable = kind === "QUOTA" || kind === "NETWORK";
  }
}

/** Zalo error codes for an invalid / expired access token. */
const AUTH_CODES = new Set([-216, -124]);
/** Too many requests. */
const QUOTA_CODES = new Set([-32]);

/**
 * Turn a non-zero `error` from an OpenAPI response into a ZaloError. Unknown codes are treated as final.
 * Zalo reuses codes (a live OA answered -223 with "Official Account has not authorized this api"),
 * so the message decides first and the code is only a fallback.
 */
export function zaloApiError(code: number, message: string | undefined): ZaloError {
  const detail = message?.trim() || undefined;
  const text = detail ?? "";
  if (/not authorized|permission/i.test(text)) return new ZaloError("PERMISSION", detail, code);
  if (AUTH_CODES.has(code) || /access[ _]?token/i.test(text)) return new ZaloError("AUTH", detail, code);
  if (QUOTA_CODES.has(code) || /quota|rate limit|too many/i.test(text)) return new ZaloError("QUOTA", detail, code);
  return new ZaloError("REJECTED", detail, code);
}

export function toZaloError(error: unknown): ZaloError {
  if (error instanceof ZaloError) return error;
  return new ZaloError("NETWORK", error instanceof Error ? error.message : String(error));
}
