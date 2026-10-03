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

/** Add days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC offset of the app timezone on a given date, e.g. "+07:00". */
function offsetFor(date: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value; // "GMT+07:00" (or "GMT" for UTC)
  const offset = name?.replace("GMT", "") ?? "";
  return offset === "" ? "+00:00" : offset;
}

/** Deadlines picked without a time mean "by end of day". */
export const END_OF_DAY = "23:59";

/** Local date (YYYY-MM-DD) + optional time (HH:MM) → ISO timestamp with offset. */
export function toDeadlineISO(date: string, time?: string | null) {
  return `${date}T${time || END_OF_DAY}:00${offsetFor(date)}`;
}

/** 00:00 of a local date as an ISO timestamp, for range queries. */
export function startOfDayISO(date: string) {
  return `${date}T00:00:00${offsetFor(date)}`;
}

/** Split a timestamptz into local date + time for form inputs. Time is "" for end-of-day deadlines. */
export function fromDeadlineISO(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(d);
  const time = formatTimeLocal(iso);
  return { date, time: time === END_OF_DAY ? "" : time };
}

/** Human deadline: "Hôm nay 17:00", "Ngày mai", "Hôm qua 17:00", "T2, 5/10 · 09:00". */
export function formatDeadline(iso: string, now = new Date()) {
  const { date, time } = fromDeadlineISO(iso);
  const day = formatDay(date, now);
  return time ? `${day} · ${time}` : day;
}

/** Relative day label for a local date: "Hôm nay", "Ngày mai", "Hôm qua", "T2, 5/10". */
export function formatDay(date: string, now = new Date()) {
  const today = todayLocal(now);
  if (date === today) return "Hôm nay";
  if (date === addDays(today, 1)) return "Ngày mai";
  if (date === addDays(today, -1)) return "Hôm qua";
  const weekday = WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7]?.short ?? "";
  const [, m, d] = date.split("-");
  return `${weekday}, ${Number(d)}/${Number(m)}`;
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
