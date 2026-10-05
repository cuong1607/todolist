import type { Enums, Json } from "@/types/database";

export const NOTIFICATION_TYPE_LABELS: Record<Enums<"notification_type">, string> = {
  MORNING_SUMMARY: "Tóm tắt buổi sáng",
  DEADLINE_REMINDER: "Nhắc deadline",
  OVERDUE_REMINDER: "Báo quá hạn",
  END_OF_DAY_SUMMARY: "Tổng kết cuối ngày",
  ADMIN_DAILY_SUMMARY: "Tổng kết team",
  NEW_TASK: "Việc mới",
  DEADLINE_CHANGED: "Đổi deadline",
};

export const NOTIFICATION_PROVIDER_LABELS: Record<Enums<"notification_provider">, string> = {
  IN_APP: "Trong ứng dụng",
  ZALO: "Zalo",
};

export const NOTIFICATION_STATUS_LABELS: Record<Enums<"notification_status">, string> = {
  PENDING: "Chờ gửi",
  PROCESSING: "Đang gửi",
  SENT: "Đã gửi",
  FAILED: "Thất bại",
};

/** `notification_logs.payload` is written by the scheduler as { title, body, url? }; read it defensively. */
export function readPayload(payload: Json | null): { title: string; body: string; url: string | null } {
  const data = payload !== null && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const text = (v: Json | undefined) => (typeof v === "string" ? v : "");
  const url = text(data.url);
  // Only in-app paths: a payload must never be able to send someone to another site.
  return { title: text(data.title), body: text(data.body), url: url.startsWith("/") && !url.startsWith("//") ? url : null };
}
