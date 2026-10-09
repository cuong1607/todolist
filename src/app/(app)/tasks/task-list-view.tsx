"use client";

import { useState } from "react";
import type { TeamMember } from "@/lib/members";
import { deriveStatus } from "@/lib/task-status";
import { todayLocal } from "@/lib/time";
import { assignerOf, type TodayTask } from "../today/task-types";
import { TaskDetailDialog } from "./task-detail-dialog";
import { TaskRow } from "./task-row";

export type TaskGroup = { key: string; title: string; tasks: TodayTask[] };

type Props = {
  groups: TaskGroup[];
  members: TeamMember[];
  viewer: { id: string; isAdmin: boolean };
  /** "mine": rows say who gave the task. "assigned": rows say who has it now. */
  show: "assigner" | "assignee";
};

/** "Của tôi" and "Đã giao": plain lists. Rows open the detail sheet, where "…" holds "Chuyển công việc". */
export function TaskListView({ groups, members, viewer, show }: Props) {
  const [now] = useState(() => new Date());
  const [dialog, setDialog] = useState<{ open: boolean; task: TodayTask | null }>({ open: false, task: null });
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.full_name ?? null;

  function person(task: TodayTask) {
    if (show === "assignee") return `→ ${nameOf(task.assignee_id) ?? "—"}`;
    const by = nameOf(assignerOf(task));
    return by && `Giao bởi: ${by}`;
  }

  return (
    <div className="space-y-6">
      {groups.map(({ key, title, tasks }) => (
        <section key={key} aria-labelledby={`group-${key}`} className="space-y-2">
          <h3 id={`group-${key}`} className="flex items-baseline gap-2 px-1">
            <span className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">{title}</span>
            <span className="text-caption text-muted-foreground tabular-nums">{tasks.length}</span>
          </h3>
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.id}>
                <TaskRow
                  task={task}
                  status={deriveStatus(task, now)}
                  day={todayLocal(now)}
                  now={now}
                  person={person(task)}
                  onOpen={() => setDialog({ open: true, task })}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <TaskDetailDialog
        open={dialog.open}
        task={dialog.task}
        members={members}
        viewer={viewer}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </div>
  );
}
