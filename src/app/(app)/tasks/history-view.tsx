"use client";

import { useState } from "react";
import { deriveStatus } from "@/lib/task-status";
import { formatDateLong, formatDay } from "@/lib/time";
import type { TodayTask } from "../today/task-types";
import { TaskDetailDialog } from "./task-detail-dialog";
import { TaskRow } from "./task-row";

export type HistoryDay = { date: string; tasks: TodayTask[] };

/** Past work grouped by day, newest first. Rows open a read-only detail sheet with the change log. */
export function HistoryView({ days }: { days: HistoryDay[] }) {
  const [now] = useState(() => new Date());
  const [dialog, setDialog] = useState<{ open: boolean; task: TodayTask | null }>({ open: false, task: null });

  return (
    <div className="space-y-6">
      {days.map(({ date, tasks }) => {
        const done = tasks.filter((t) => t.completed).length;
        return (
          <section key={date} aria-labelledby={`day-${date}`} className="space-y-2">
            <h3 id={`day-${date}`} className="flex items-baseline gap-2 px-1" title={formatDateLong(date)}>
              <span className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">{formatDay(date, now)}</span>
              <span className="text-caption text-muted-foreground tabular-nums">
                {done}/{tasks.length} xong
              </span>
            </h3>
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li key={task.id}>
                  <TaskRow
                    task={task}
                    status={deriveStatus(task, now)}
                    day={date}
                    now={now}
                    onOpen={() => setDialog({ open: true, task })}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <TaskDetailDialog open={dialog.open} task={dialog.task} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </div>
  );
}
