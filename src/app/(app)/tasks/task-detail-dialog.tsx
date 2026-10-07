"use client";

import { useEffect, useState } from "react";
import { Clock, Repeat, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deriveStatus } from "@/lib/task-status";
import { formatDay, formatDeadline, formatTimeLocal, localDateOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TodayTask } from "../today/task-types";
import { getTaskTimeline, type TimelineEntry, type TimelineResult } from "./actions";
import { statusLabel } from "./task-row";

type Props = {
  open: boolean;
  task: TodayTask | null;
  onOpenChange: (open: boolean) => void;
  /** Heading for the employee's note. Admins viewing a member pass their own wording. */
  employeeNoteLabel?: string;
};

/** Read-only detail sheet: what the task was, and everything that happened to it. */
export function TaskDetailDialog({ open, task, onOpenChange, employeeNoteLabel = "Ghi chú của bạn" }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet">
        {task && <Detail key={task.id} task={task} employeeNoteLabel={employeeNoteLabel} />}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ task, employeeNoteLabel }: { task: TodayTask; employeeNoteLabel: string }) {
  const now = new Date();
  const status = deriveStatus(task, now);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-8 leading-snug">{task.title}</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Badge
            className={cn(
              status === "COMPLETED" && "bg-success-soft text-success-soft-foreground",
              status === "OVERDUE" && "bg-danger-soft text-danger-soft-foreground",
              (status === "TODAY" || status === "UPCOMING") && "bg-primary-soft text-primary-soft-foreground",
            )}
          >
            {statusLabel(task, status)}
          </Badge>
          {task.type === "FIXED" ? (
            <span className="flex items-center gap-1">
              <Repeat className="size-3.5" />
              Việc cố định{task.task_date && ` · ${formatDay(task.task_date, now)}`}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Zap className="size-3.5" />
              Việc phát sinh
            </span>
          )}
          {task.deadline_at && (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              Hạn {task.type === "FIXED" ? formatTimeLocal(task.deadline_at) : formatDeadline(task.deadline_at, now)}
            </span>
          )}
        </DialogDescription>
      </DialogHeader>

      {task.note && <NoteBlock label={task.type === "FIXED" ? "Hướng dẫn" : "Ghi chú"} text={task.note} />}
      {task.employee_note && <NoteBlock label={employeeNoteLabel} text={task.employee_note} />}

      <Timeline taskId={task.id} />
    </>
  );
}

function NoteBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-xl bg-muted px-4 py-3">
      <p className="mb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-body whitespace-pre-line">{text}</p>
    </div>
  );
}

/** Other people are named when the viewer may read their profile (admins); employees just see "Quản lý". */
function who(entry: TimelineEntry) {
  if (entry.actor === "me") return "Bạn";
  if (entry.actor === "system") return "Hệ thống";
  return entry.actorName ?? "Quản lý";
}
const VERB: Record<TimelineEntry["action"], string> = {
  CREATED: "tạo việc",
  UPDATED: "cập nhật",
  RESCHEDULED: "dời deadline",
  COMPLETED: "hoàn thành",
  REOPENED: "mở lại",
};

function Timeline({ taskId }: { taskId: string }) {
  const [result, setResult] = useState<TimelineResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTaskTimeline(taskId).then(
      (r) => !cancelled && setResult(r),
      () => !cancelled && setResult({ ok: false, error: "Không tải được lịch sử" }),
    );
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return (
    <section aria-labelledby="timeline-title" className="space-y-3">
      <h3 id="timeline-title" className="text-micro font-semibold tracking-wide text-muted-foreground uppercase">
        Lịch sử
      </h3>
      {result === null ? (
        <div role="status" aria-label="Đang tải lịch sử" className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="mt-1.5 size-2 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : !result.ok ? (
        <p role="alert" className="text-caption text-danger">
          {result.error}
        </p>
      ) : result.entries.length === 0 ? (
        <p className="text-caption text-muted-foreground">Chưa có thay đổi nào được ghi lại.</p>
      ) : (
        <ol className="space-y-3">
          {result.entries.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  e.action === "COMPLETED" ? "bg-success" : e.action === "REOPENED" ? "bg-warning" : "bg-muted-foreground/40",
                )}
              />
              <div className="min-w-0">
                <p className="font-medium">
                  {who(e)} {VERB[e.action]}
                </p>
                {e.detail && <p className="text-caption text-muted-foreground">{e.detail}</p>}
                <p className="text-micro text-muted-foreground">
                  {formatDay(localDateOf(e.at))} · {formatTimeLocal(e.at)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
