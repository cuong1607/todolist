"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/shell/user-avatar";
import type { TeamMember } from "@/lib/members";
import { deriveStatus } from "@/lib/task-status";
import { formatDateLong, formatDay, localDateOf } from "@/lib/time";
import { TaskDetailDialog } from "../../tasks/task-detail-dialog";
import { TaskRow } from "../../tasks/task-row";
import type { TodayTask } from "../../today/task-types";

/** FIXED on its day; ADHOC on the day it was done, or on its deadline while still open. */
function dayOf(task: TodayTask) {
  if (task.type === "FIXED") return task.task_date;
  if (task.completed_at) return localDateOf(task.completed_at);
  return task.deadline_at ? localDateOf(task.deadline_at) : null;
}

type Props = {
  member: { id: string; name: string; avatarUrl: string | null };
  rangeLabel: string;
  tasks: TodayTask[];
  /** The dashboard URL without this member — where closing the sheet goes. */
  closeHref: string;
  /** The team by name and the admin looking at it: lets a task sheet name people and reassign the task. */
  team: TeamMember[];
  viewer: { id: string; isAdmin: boolean };
};

/** One member's tasks for the selected range, by day. Bottom sheet on mobile, side sheet from `sm`. */
export function MemberSheet({ member, rangeLabel, tasks, closeHref, team, viewer }: Props) {
  const router = useRouter();
  const [now] = useState(() => new Date());
  // Close instantly; the URL (the source of truth for which sheet is open) catches up.
  const [open, setOpen] = useState(true);
  const [detail, setDetail] = useState<{ open: boolean; task: TodayTask | null }>({ open: false, task: null });

  const days = useMemo(() => {
    const byDay = new Map<string, TodayTask[]>();
    for (const task of tasks) {
      const day = dayOf(task);
      if (!day) continue;
      const list = byDay.get(day);
      if (list) list.push(task);
      else byDay.set(day, [task]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, list]) => ({
        date,
        tasks: list.sort(
          (a, b) =>
            Number(b.type === "FIXED") - Number(a.type === "FIXED") ||
            a.sort_order - b.sort_order ||
            (a.deadline_at ?? "9999").localeCompare(b.deadline_at ?? "9999"),
        ),
      }));
  }, [tasks]);

  const done = tasks.filter((t) => t.completed).length;
  const overdue = tasks.filter((t) => deriveStatus(t, now) === "OVERDUE").length;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) router.push(closeHref, { scroll: false });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent variant="sheet">
          <DialogHeader className="flex-row items-center gap-3 pr-8">
            <UserAvatar name={member.name} src={member.avatarUrl} size="lg" className="size-11" />
            <div className="min-w-0 space-y-1">
              <DialogTitle className="truncate leading-snug">{member.name}</DialogTitle>
              <DialogDescription>
                {rangeLabel} · {done}/{tasks.length} xong
                {overdue > 0 && <span className="font-medium text-danger"> · {overdue} quá hạn</span>}
              </DialogDescription>
            </div>
          </DialogHeader>

          {days.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-caption text-muted-foreground">
              Không có việc nào trong khoảng thời gian này.
            </p>
          ) : (
            <div className="space-y-5">
              {days.map(({ date, tasks: list }) => (
                <section key={date} aria-labelledby={`member-day-${date}`} className="space-y-2">
                  <h3 id={`member-day-${date}`} className="flex items-baseline gap-2 px-1" title={formatDateLong(date)}>
                    <span className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">{formatDay(date, now)}</span>
                    <span className="text-caption text-muted-foreground tabular-nums">
                      {list.filter((t) => t.completed).length}/{list.length} xong
                    </span>
                  </h3>
                  <ul className="space-y-2">
                    {list.map((task) => (
                      <li key={task.id}>
                        <TaskRow
                          task={task}
                          status={deriveStatus(task, now)}
                          day={date}
                          now={now}
                          onOpen={() => setDetail({ open: true, task })}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <TaskDetailDialog
        open={detail.open}
        task={detail.task ? (tasks.find((t) => t.id === detail.task!.id) ?? detail.task) : null}
        employeeNoteLabel="Ghi chú của nhân viên"
        members={team}
        viewer={viewer}
        onOpenChange={(next) => setDetail((d) => ({ ...d, open: next }))}
      />
    </>
  );
}
