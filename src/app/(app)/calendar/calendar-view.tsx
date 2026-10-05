"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { deriveStatus } from "@/lib/task-status";
import { WEEKDAYS, addDays, formatDateLong, isoWeekday, localDateOf, todayLocal } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TaskDetailDialog } from "../tasks/task-detail-dialog";
import { TaskRow } from "../tasks/task-row";
import type { TodayTask } from "../today/task-types";

/** Where a task sits on the calendar: FIXED on its day; ADHOC on its deadline, or the day it was done if it had none. */
function calendarDay(task: TodayTask) {
  if (task.type === "FIXED") return task.task_date;
  if (task.deadline_at) return localDateOf(task.deadline_at);
  return task.completed_at ? localDateOf(task.completed_at) : null;
}

const byTime = (a: TodayTask, b: TodayTask) =>
  Number(b.type === "FIXED") - Number(a.type === "FIXED") ||
  a.sort_order - b.sort_order ||
  (a.deadline_at ?? "9999").localeCompare(b.deadline_at ?? "9999");

type Props = {
  /** First day of the shown month, YYYY-MM-01. */
  firstDay: string;
  daysInMonth: number;
  tasks: TodayTask[];
};

export function CalendarView({ firstDay, daysInMonth, tasks }: Props) {
  const [now] = useState(() => new Date());
  const today = todayLocal(now);
  const lastDay = addDays(firstDay, daysInMonth - 1);

  const byDay = useMemo(() => {
    const map = new Map<string, TodayTask[]>();
    for (const task of tasks) {
      const day = calendarDay(task);
      if (!day) continue;
      const list = map.get(day);
      if (list) list.push(task);
      else map.set(day, [task]);
    }
    for (const list of map.values()) list.sort(byTime);
    return map;
  }, [tasks]);

  const [selected, setSelected] = useState(() => (today >= firstDay && today <= lastDay ? today : firstDay));
  const [dialog, setDialog] = useState<{ open: boolean; task: TodayTask | null }>({ open: false, task: null });

  const days = Array.from({ length: daysInMonth }, (_, i) => addDays(firstDay, i));
  const leading = isoWeekday(firstDay) - 1;
  const selectedTasks = byDay.get(selected) ?? [];
  const selectedDone = selectedTasks.filter((t) => t.completed).length;
  const longDate = formatDateLong(selected);

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr] md:items-start">
      <div className="rounded-2xl border bg-surface p-2 shadow-card">
        <div aria-hidden className="grid grid-cols-7 pb-1 text-center text-micro font-semibold text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <span key={d.value} className="py-1">
              {d.short}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {Array.from({ length: leading }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {days.map((day) => {
            const list = byDay.get(day) ?? [];
            const late = list.some((t) => deriveStatus(t, now) === "OVERDUE");
            const allDone = list.length > 0 && list.every((t) => t.completed);
            const isSelected = day === selected;
            const dayNumber = Number(day.slice(8));
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelected(day)}
                aria-pressed={isSelected}
                aria-current={day === today ? "date" : undefined}
                aria-label={`Ngày ${dayNumber}${list.length > 0 ? `, ${list.length} việc` : ""}`}
                className={cn(
                  "relative mx-auto flex size-11 flex-col items-center justify-center rounded-xl text-body tabular-nums outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
                  isSelected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted",
                  !isSelected && day === today && "font-bold text-primary ring-1 ring-primary/40",
                  !isSelected && day < today && "text-muted-foreground",
                )}
              >
                {dayNumber}
                {list.length > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute bottom-1.5 size-1.5 rounded-full",
                      isSelected ? "bg-primary-foreground" : late ? "bg-danger" : allDone ? "bg-success" : "bg-primary",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
        <ul aria-hidden className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 border-t pt-2 text-micro text-muted-foreground">
          <Legend className="bg-primary" label="Có việc" />
          <Legend className="bg-success" label="Xong hết" />
          <Legend className="bg-danger" label="Trễ / bỏ lỡ" />
        </ul>
      </div>

      <section aria-labelledby="day-title" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h3 id="day-title" className="text-title">
            {longDate.charAt(0).toUpperCase() + longDate.slice(1)}
          </h3>
          {selectedTasks.length > 0 && (
            <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
              {selectedDone}/{selectedTasks.length} xong
            </span>
          )}
        </div>

        {selectedTasks.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-surface px-4 py-8 text-center text-caption text-muted-foreground">
            {selected > today ? "Chưa có việc nào hẹn ngày này. Việc cố định sẽ hiện khi đến ngày." : "Không có việc nào trong ngày này."}
          </p>
        ) : (
          <ul className="space-y-2">
            {selectedTasks.map((task) => (
              <li key={task.id}>
                <TaskRow
                  task={task}
                  status={deriveStatus(task, now)}
                  day={selected}
                  now={now}
                  onOpen={() => setDialog({ open: true, task })}
                />
              </li>
            ))}
          </ul>
        )}

        {selected === today && (
          <Link
            href="/today"
            className="flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Làm việc ở trang Hôm nay
            <ArrowRight className="size-4" />
          </Link>
        )}
      </section>

      <TaskDetailDialog open={dialog.open} task={dialog.task} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("size-1.5 rounded-full", className)} />
      {label}
    </li>
  );
}
