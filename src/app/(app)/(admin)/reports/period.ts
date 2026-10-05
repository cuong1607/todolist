import { z } from "zod";
import { addDays, daysBetween, endOfMonth, formatDateLong, formatDateShort, startOfWeek } from "@/lib/time";

export const PERIOD_OPTIONS = [
  { key: "day", label: "Ngày" },
  { key: "week", label: "Tuần" },
  { key: "month", label: "Tháng" },
  { key: "custom", label: "Tuỳ chọn" },
] as const;

export type PeriodKey = (typeof PERIOD_OPTIONS)[number]["key"];

/** Aggregated in SQL, so this only bounds the number of points on the trend charts. */
export const MAX_CUSTOM_DAYS = 92;

export type Period = {
  key: PeriodKey;
  /** Local dates, inclusive. */
  from: string;
  to: string;
  label: string;
  /** Step to the previous / next day, week or month. Null for custom ranges and for periods that would start in the future. */
  prevHref: string | null;
  nextHref: string | null;
  /** The custom range was longer than MAX_CUSTOM_DAYS and got shortened. */
  clamped: boolean;
};

type Params = { period?: string | string[]; date?: string | string[]; from?: string | string[]; to?: string | string[] };

const isoDate = z.iso.date();

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Link to the report for a period. `date` anchors day/week/month (any day inside it); omitted = current. */
export function reportHref(key: PeriodKey, opts: { date?: string; from?: string; to?: string } = {}) {
  const params = new URLSearchParams();
  if (key !== "week") params.set("period", key);
  if (key === "custom") {
    if (opts.from) params.set("from", opts.from);
    if (opts.to) params.set("to", opts.to);
  } else if (opts.date) {
    params.set("date", opts.date);
  }
  const query = params.toString();
  return query ? `/reports?${query}` : "/reports";
}

/** URL params → a concrete period. Anything invalid falls back to something sensible, never an error. */
export function resolvePeriod(params: Params, today: string): Period {
  const key = PERIOD_OPTIONS.find((o) => o.key === params.period)?.key ?? "week";

  if (key === "custom") {
    const from = isoDate.safeParse(params.from);
    const to = isoDate.safeParse(params.to);
    // Nothing picked yet: start from the last 30 days.
    const [a, b] = from.success && to.success ? [from.data, to.data] : [addDays(today, -29), today];
    const [start, rawEnd] = a <= b ? [a, b] : [b, a];
    const clamped = daysBetween(start, rawEnd) >= MAX_CUSTOM_DAYS;
    const end = clamped ? addDays(start, MAX_CUSTOM_DAYS - 1) : rawEnd;
    return { key, from: start, to: end, label: `${formatDateShort(start)} – ${formatDateShort(end)}`, prevHref: null, nextHref: null, clamped };
  }

  const parsed = isoDate.safeParse(params.date);
  const anchor = parsed.success && parsed.data <= today ? parsed.data : today;
  // A step lands on the first day of the neighbouring period; "next" stops at the present.
  const step = (from: string, to: string, label: string, prevAnchor: string): Period => {
    const next = addDays(to, 1);
    return {
      key,
      from,
      to,
      label,
      prevHref: reportHref(key, { date: prevAnchor }),
      nextHref: next <= today ? reportHref(key, { date: next }) : null,
      clamped: false,
    };
  };

  switch (key) {
    case "day":
      return step(anchor, anchor, capitalize(formatDateLong(anchor)), addDays(anchor, -1));
    case "week": {
      const from = startOfWeek(anchor);
      const to = addDays(from, 6);
      return step(from, to, `${formatDateShort(from)} – ${formatDateShort(to)}`, addDays(from, -7));
    }
    case "month": {
      const from = `${anchor.slice(0, 8)}01`;
      const [year, month] = anchor.split("-").map(Number);
      return step(from, endOfMonth(anchor), `Tháng ${month}, ${year}`, addDays(from, -1));
    }
  }
}
