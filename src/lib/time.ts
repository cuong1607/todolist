/** Must match private.app_timezone() in the database. */
export const APP_TIMEZONE = "Asia/Bangkok";

/** Today's date in the app timezone, as YYYY-MM-DD (matches `tasks.task_date`). */
export function todayLocal(now = new Date()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(now);
}

/** "17:30" for a timestamptz, shown in the app timezone. */
export function formatTimeLocal(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** "Thứ Bảy, 3 tháng 10" */
export function formatDateLong(date: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: APP_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00+07:00`));
}

/** "HH:MM:SS" from Postgres `time` → "HH:MM". */
export function trimSeconds(time: string) {
  return time.slice(0, 5);
}

/** ISO weekdays: 1 = Monday … 7 = Sunday. */
export const WEEKDAYS = [
  { value: 1, short: "T2", long: "Thứ Hai" },
  { value: 2, short: "T3", long: "Thứ Ba" },
  { value: 3, short: "T4", long: "Thứ Tư" },
  { value: 4, short: "T5", long: "Thứ Năm" },
  { value: 5, short: "T6", long: "Thứ Sáu" },
  { value: 6, short: "T7", long: "Thứ Bảy" },
  { value: 7, short: "CN", long: "Chủ Nhật" },
] as const;

export function describeWeekdays(days: number[]) {
  const set = new Set(days);
  if (set.size === 7) return "Hằng ngày";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Thứ 2 – Thứ 6";
  if (set.size === 6 && [1, 2, 3, 4, 5, 6].every((d) => set.has(d))) return "Thứ 2 – Thứ 7";
  return WEEKDAYS.filter((d) => set.has(d.value))
    .map((d) => d.short)
    .join(", ");
}
