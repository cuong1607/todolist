import { z } from "zod";
import { addDays, daysBetween, endOfMonth, formatDateLong, formatDateShort, startOfWeek } from "@/lib/time";

export const RANGE_OPTIONS = [
  { key: "today", label: "Hôm nay" },
  { key: "7d", label: "7 ngày" },
  { key: "week", label: "Tuần này" },
  { key: "month", label: "Tháng này" },
  { key: "custom", label: "Tuỳ chọn" },
] as const;

export type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];

/** Keeps one member's task list under the Data API row limit. */
export const MAX_CUSTOM_DAYS = 31;

export type Range = {
  key: RangeKey;
  /** Local dates, inclusive. */
  from: string;
  to: string;
  /** The custom range was longer than MAX_CUSTOM_DAYS and got shortened. */
  clamped: boolean;
};

type Params = { range?: string | string[]; from?: string | string[]; to?: string | string[] };

const isoDate = z.iso.date();

/** URL params → a concrete date range. Anything invalid falls back to something sensible, never an error. */
export function resolveRange(params: Params, today: string): Range {
  const key = RANGE_OPTIONS.find((o) => o.key === params.range)?.key ?? "today";
  const preset = (from: string, to: string): Range => ({ key, from, to, clamped: false });

  switch (key) {
    case "today":
      return preset(today, today);
    case "7d":
      return preset(addDays(today, -6), today);
    case "week":
      return preset(startOfWeek(today), addDays(startOfWeek(today), 6));
    case "month":
      return preset(`${today.slice(0, 8)}01`, endOfMonth(today));
    case "custom": {
      const from = isoDate.safeParse(params.from);
      const to = isoDate.safeParse(params.to);
      // Nothing picked yet: start from the last 7 days.
      if (!from.success || !to.success) return preset(addDays(today, -6), today);
      const [start, end] = from.data <= to.data ? [from.data, to.data] : [to.data, from.data];
      const clamped = daysBetween(start, end) >= MAX_CUSTOM_DAYS;
      return { key, from: start, to: clamped ? addDays(start, MAX_CUSTOM_DAYS - 1) : end, clamped };
    }
  }
}

/** Link to the dashboard for a range, optionally with a member's sheet open. */
export function overviewHref(range: Pick<Range, "key" | "from" | "to">, memberId?: string) {
  const params = new URLSearchParams();
  if (range.key !== "today") params.set("range", range.key);
  if (range.key === "custom") {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  if (memberId) params.set("member", memberId);
  const query = params.toString();
  return query ? `/overview?${query}` : "/overview";
}

/** "Thứ Hai, 5 tháng 10" for a single day, "29/9 – 5/10" otherwise. */
export function describeRange(range: Pick<Range, "from" | "to">) {
  if (range.from === range.to) {
    const long = formatDateLong(range.from);
    return long.charAt(0).toUpperCase() + long.slice(1);
  }
  return `${formatDateShort(range.from)} – ${formatDateShort(range.to)}`;
}
