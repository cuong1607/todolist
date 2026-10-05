"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2, Repeat, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
};

/** Read-only detail sheet: what the task was, and everything that happened to it. */
export function TaskDetailDialog({ open, task, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {task && <Detail key={task.id} task={task} />}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ task }: { task: TodayTask }) {
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
      {task.employee_note && <NoteBlock label="Ghi chú của bạn" text={task.employee_note} />}

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

const WHO: Record<TimelineEntry["actor"], string> = { me: "Bạn", system: "Hệ thống", other: "Quản lý" };
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
        <p className="flex items-center gap-2 text-caption text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Đang tải…
        </p>
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
                  {WHO[e.actor]} {VERB[e.action]}
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
