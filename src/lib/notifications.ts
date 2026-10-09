import type { Enums, Json } from "@/types/database";

export const NOTIFICATION_TYPE_LABELS: Record<Enums<"notification_type">, string> = {
  MORNING_SUMMARY: "Tóm tắt buổi sáng",
  DEADLINE_REMINDER: "Nhắc deadline",
  OVERDUE_REMINDER: "Báo quá hạn",
  END_OF_DAY_SUMMARY: "Tổng kết cuối ngày",
  ADMIN_DAILY_SUMMARY: "Tổng kết team",
  NEW_TASK: "Việc mới",
  DEADLINE_CHANGED: "Đổi deadline",
  TEST: "Tin nhắn thử",
  TASK_ASSIGNED: "Được giao việc",
  TASK_TRANSFERRED: "Nhận việc chuyển giao",
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

/** Minutes before a deadline the team can be reminded; 0 = off. Must match the options private.notification_schedule() accepts in SQL. */
export const DEADLINE_REMINDER_OPTIONS = [0, 30, 60, 120] as const;
export type DeadlineReminderMinutes = (typeof DEADLINE_REMINDER_OPTIONS)[number];

export const isDeadlineReminderMinutes = (value: unknown): value is DeadlineReminderMinutes =>
  DEADLINE_REMINDER_OPTIONS.some((option) => option === value);

/** `notification_logs.payload` is written by the scheduler as { title, body, url? }; read it defensively. */
export function readPayload(payload: Json | null): { title: string; body: string; url: string | null } {
  const data = payload !== null && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const text = (v: Json | undefined) => (typeof v === "string" ? v : "");
  const url = text(data.url);
  // Only in-app paths: a payload must never be able to send someone to another site.
  return { title: text(data.title), body: text(data.body), url: url.startsWith("/") && !url.startsWith("//") ? url : null };
}
