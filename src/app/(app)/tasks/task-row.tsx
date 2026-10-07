"use client";

import { Check, Clock, Repeat, X } from "lucide-react";
import type { DisplayStatus } from "@/lib/task-status";
import { formatDay, formatDeadline, formatTimeLocal, localDateOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TodayTask } from "../today/task-types";

/** A fixed task whose day has passed can no longer be done — "missed", not merely late. */
export function isMissed(task: TodayTask, status: DisplayStatus) {
  return task.type === "FIXED" && status === "OVERDUE";
}

export function statusLabel(task: TodayTask, status: DisplayStatus) {
  if (status === "COMPLETED") return "Đã xong";
  if (status === "OVERDUE") return isMissed(task, status) ? "Bỏ lỡ" : "Quá hạn";
  return status === "UPCOMING" ? "Sắp tới" : "Đang làm";
}

type Props = {
  task: TodayTask;
  status: DisplayStatus;
  /** The day this row is listed under; times on other days get a day label. */
  day: string;
  now: Date;
  onOpen: () => void;
};

/** Read-only row for history and calendar. Ticking happens on the Today screen. */
export function TaskRow({ task, status, day, now, onOpen }: Props) {
  const done = status === "COMPLETED";
  const late = status === "OVERDUE";

  const meta: string[] = [];
  if (task.deadline_at) {
    const time = formatTimeLocal(task.deadline_at);
    meta.push(localDateOf(task.deadline_at) === day ? `Hạn ${time}` : `Hạn ${formatDeadline(task.deadline_at, now)}`);
  }
  if (done && task.completed_at) {
    const doneDay = localDateOf(task.completed_at);
    meta.push(`Xong ${doneDay === day ? "" : `${formatDay(doneDay, now)} · `}${formatTimeLocal(task.completed_at)}`);
  } else if (late) {
    meta.push(statusLabel(task, status));
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Chi tiết “${task.title}”`}
      className={cn(
        "flex min-h-14 w-full items-start gap-3 rounded-xl border bg-surface px-3 py-3 text-left shadow-card outline-none transition-colors duration-200 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
        done && "bg-muted/40 shadow-none",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2",
          done ? "border-success bg-success text-success-foreground" : late ? "border-danger/60 text-danger" : "border-input",
        )}
      >
        {done ? <Check className="size-3.5" strokeWidth={3} /> : late ? <X className="size-3.5" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-medium", done && "text-muted-foreground")}>{task.title}</span>
        <span className={cn("mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-muted-foreground", late && "text-danger")}>
          {task.type === "FIXED" && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Repeat className="size-3.5" />
              Cố định
            </span>
          )}
          {meta.length > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5 shrink-0" />
              {meta.join(" · ")}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
