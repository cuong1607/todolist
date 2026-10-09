"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Repeat, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deriveStatus } from "@/lib/task-status";
import { formatDay, formatDeadline, formatTimeLocal, localDateOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/lib/members";
import { transferTask } from "../today/actions";
import type { TodayTask } from "../today/task-types";
import { getTaskTimeline, type TimelineEntry, type TimelineResult } from "./actions";
import { statusLabel } from "./task-row";
import { canTransfer, TransferTask } from "./transfer-task";

type Props = {
  open: boolean;
  task: TodayTask | null;
  onOpenChange: (open: boolean) => void;
  /** Heading for the employee's note. Admins viewing a member pass their own wording. */
  employeeNoteLabel?: string;
  /** The team by name: names the creator and the assignee of an ad-hoc task. */
  members?: TeamMember[];
  /** With `members`: adds "Chuyển công việc" to the "…" menu when this viewer may transfer the task. */
  viewer?: { id: string; isAdmin: boolean };
};

/** Detail sheet: what the task is, who it belongs to, and everything that happened to it. Content is read-only. */
export function TaskDetailDialog({ open, task, onOpenChange, employeeNoteLabel = "Ghi chú của bạn", members, viewer }: Props) {
  const router = useRouter();

  /** Close first, then ask the server; the page re-reads its list afterwards. */
  async function transfer(target: TodayTask, toId: string) {
    onOpenChange(false);
    const result = await transferTask(target.id, toId).catch(() => ({ ok: false as const, error: "Không chuyển được công việc" }));
    if (result.ok) {
      toast.success(`Đã chuyển cho ${members?.find((m) => m.id === toId)?.full_name ?? "người nhận"}`);
      router.refresh();
    } else {
      toast.error(result.error, { action: { label: "Thử lại", onClick: () => void transfer(target, toId) } });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet">
        {task && (
          <Detail
            key={task.id}
            task={task}
            employeeNoteLabel={employeeNoteLabel}
            members={members}
            viewer={viewer}
            onTransfer={(toId) => void transfer(task, toId)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type DetailProps = Pick<Props, "members" | "viewer"> & { task: TodayTask; employeeNoteLabel: string; onTransfer: (toId: string) => void };

function Detail({ task, employeeNoteLabel, members, viewer, onTransfer }: DetailProps) {
  const now = new Date();
  const status = deriveStatus(task, now);
  const nameOf = (id: string | null) => members?.find((m) => m.id === id)?.full_name ?? null;
  const transferable = !!members && !!viewer && canTransfer(task, viewer);

  return (
    <>
      <DialogHeader>
        <DialogTitle className={cn("leading-snug", transferable ? "pr-16" : "pr-8")}>{task.title}</DialogTitle>
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
      {transferable && (
        <TransferTask task={task} candidates={members.filter((m) => m.active && m.id !== task.assignee_id)} onTransfer={onTransfer} />
      )}

      {task.type === "ADHOC" && members && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption">
          <dt className="text-muted-foreground">Người tạo</dt>
          <dd className="font-medium">{nameOf(task.created_by) ?? "—"}</dd>
          <dt className="text-muted-foreground">Người phụ trách</dt>
          <dd className="font-medium">{nameOf(task.assignee_id) ?? "—"}</dd>
        </dl>
      )}

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
/** "tạo việc", "giao việc cho Bình", "chuyển việc từ An sang Bình" … */
function what(entry: TimelineEntry) {
  const to = entry.toName ?? "người khác";
  switch (entry.action) {
    case "CREATED":
      return "tạo việc";
    case "UPDATED":
      return "cập nhật";
    case "RESCHEDULED":
      return "dời deadline";
    case "COMPLETED":
      return "hoàn thành";
    case "REOPENED":
      return "mở lại";
    case "TASK_ASSIGNED":
      return `giao việc cho ${to}`;
    case "TASK_TRANSFERRED":
    case "TASK_REASSIGNED_BY_ADMIN":
      return entry.fromName ? `chuyển việc từ ${entry.fromName} sang ${to}` : `chuyển việc cho ${to}`;
  }
}

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
                  {who(e)} {what(e)}
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
