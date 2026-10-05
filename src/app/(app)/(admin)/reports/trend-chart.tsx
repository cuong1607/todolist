"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type TrendPoint = {
  /** Short x-axis label, e.g. "5/10". */
  tick: string;
  /** Full label for the tooltip, e.g. "Thứ Hai, 5 tháng 10". */
  label: string;
  /** null = no data that day (a gap, not a zero). */
  value: number | null;
  /** Extra tooltip line, e.g. "4/5 việc". */
  note?: string;
};

type Props = {
  kind: "line" | "column";
  points: TrendPoint[];
  /** Appended to values ("%"), or empty for counts. */
  unit?: string;
  /** Fixed top of the scale (100 for percentages). Counts pick a round number. */
  max?: number;
  tone: "primary" | "danger";
  ariaLabel: string;
};

const HEIGHT = 190;
const MARGIN = { top: 14, bottom: 24, left: 34 };
const MAX_X_TICKS = 6;

/** Smallest even number ≥ the largest value, so the middle gridline is a whole count. */
function roundMax(values: number[]) {
  const top = Math.max(2, ...values);
  return top % 2 === 0 ? top : top + 1;
}

/** Column with a 4px rounded data-end, square at the baseline. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/**
 * Single-series trend: a 2px line (with a light wash) or thin columns. One y-axis, hairline grid,
 * only the latest value labelled; every other value is in the tooltip and in the table below the charts.
 */
export function TrendChart({ kind, points, unit = "", max, tone, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const top = max ?? roundMax(values);
  const yTicks = [0, top / 2, top];
  // Room on the right for the end label of a line.
  const right = kind === "line" ? 44 : 10;
  const innerW = Math.max(0, width - MARGIN.left - right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const n = points.length;
  const band = n > 0 ? innerW / n : 0;
  const xOf = (i: number) => MARGIN.left + band * (i + 0.5);
  const yOf = (v: number) => MARGIN.top + innerH * (1 - v / top);
  const baseline = MARGIN.top + innerH;

  const xTickEvery = Math.max(1, Math.ceil(n / MAX_X_TICKS));
  const lastIndex = points.findLastIndex((p) => p.value !== null);

  // Consecutive non-null points form one line segment; nulls break the line.
  const segments: number[][] = [];
  points.forEach((p, i) => {
    if (p.value === null) return;
    const current = segments[segments.length - 1];
    if (current && current[current.length - 1] === i - 1) current.push(i);
    else segments.push([i]);
  });

  function indexAt(clientX: number) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || band === 0) return null;
    return Math.min(n - 1, Math.max(0, Math.floor((clientX - rect.left - MARGIN.left) / band)));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActive((i) => Math.min(n - 1, Math.max(0, (i ?? (e.key === "ArrowLeft" ? n : -1)) + (e.key === "ArrowLeft" ? -1 : 1))));
  }

  const activePoint = active !== null ? points[active] : undefined;
  const barW = Math.min(24, Math.max(2, band - 2));

  return (
    <div
      ref={ref}
      role="group"
      aria-label={`${ariaLabel}. Dùng phím mũi tên trái phải để xem từng ngày.`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onBlur={() => setActive(null)}
      className={cn(
        "relative touch-pan-y rounded-lg outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
        tone === "primary" ? "text-primary" : "text-danger",
      )}
      style={{ height: HEIGHT }}
    >
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={(e) => setActive(indexAt(e.clientX))}
          onPointerDown={(e) => setActive(indexAt(e.clientX))}
          onPointerLeave={() => setActive(null)}
        >
          {/* grid + y ticks */}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={width - right} y1={yOf(t)} y2={yOf(t)} className="stroke-border" strokeWidth={1} />
              <text x={MARGIN.left - 6} y={yOf(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {t}
                {unit}
              </text>
            </g>
          ))}

          {/* x ticks */}
          {points.map((p, i) =>
            i % xTickEvery === 0 ? (
              <text key={i} x={xOf(i)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular-nums">
                {p.tick}
              </text>
            ) : null,
          )}

          {kind === "column" &&
            points.map((p, i) =>
              p.value ? (
                <path
                  key={i}
                  d={columnPath(xOf(i) - barW / 2, yOf(p.value), barW, baseline - yOf(p.value))}
                  fill="currentColor"
                  opacity={active === null || active === i ? 1 : 0.45}
                />
              ) : null,
            )}

          {kind === "line" && (
            <>
              {active !== null && <line x1={xOf(active)} x2={xOf(active)} y1={MARGIN.top} y2={baseline} className="stroke-muted-foreground/50" strokeWidth={1} />}
              {segments.map((seg) => {
                const first = seg[0]!;
                const last = seg[seg.length - 1]!;
                const line = seg.map((i, k) => `${k === 0 ? "M" : "L"}${xOf(i)},${yOf(points[i]!.value!)}`).join(" ");
                return (
                  <g key={first}>
                    {seg.length > 1 && <path d={`${line} L${xOf(last)},${baseline} L${xOf(first)},${baseline} Z`} fill="currentColor" opacity={0.1} />}
                    <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {/* A lone point between gaps has no line to show it. */}
                    {seg.length === 1 && first !== lastIndex && <circle cx={xOf(first)} cy={yOf(points[first]!.value!)} r={3} fill="currentColor" />}
                  </g>
                );
              })}
              {[lastIndex, active].map((i, k) =>
                i !== null && i >= 0 && points[i]?.value != null && (k === 0 || i !== lastIndex) ? (
                  <circle key={k} cx={xOf(i)} cy={yOf(points[i].value)} r={4} fill="currentColor" className="stroke-surface" strokeWidth={2} />
                ) : null,
              )}
              {/* Only the latest value is labelled directly. */}
              {lastIndex >= 0 && (
                <text
                  x={xOf(lastIndex) + 9}
                  y={yOf(points[lastIndex]!.value!)}
                  dy="0.32em"
                  className="fill-foreground text-[12px] font-semibold tabular-nums"
                >
                  {points[lastIndex]!.value}
                  {unit}
                </text>
              )}
            </>
          )}
        </svg>
      )}

      {activePoint && active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 w-max max-w-44 -translate-x-1/2 rounded-lg border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-raised"
          style={{ left: Math.min(Math.max(xOf(active), 70), Math.max(70, width - 70)) }}
        >
          <p className="font-semibold tabular-nums text-foreground">
            {activePoint.value === null ? "Không có dữ liệu" : `${activePoint.value}${unit}`}
            {activePoint.note && <span className="ml-1.5 font-normal text-muted-foreground">{activePoint.note}</span>}
          </p>
          <p className="text-micro text-muted-foreground">{activePoint.label}</p>
        </div>
      )}
    </div>
  );
}
