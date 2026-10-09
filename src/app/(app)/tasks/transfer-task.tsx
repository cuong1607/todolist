"use client";

import { useState } from "react";
import { ArrowRightLeft, Check, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TodayTask } from "../today/task-types";

/** Who may hand a task over — the same rule as the `transfer_task` RPC, which is what enforces it. */
export function canTransfer(task: TodayTask, viewer: { id: string; isAdmin: boolean }) {
  return task.type === "ADHOC" && !task.completed && (viewer.isAdmin || task.assignee_id === viewer.id || task.created_by === viewer.id);
}

type Props = {
  task: TodayTask;
  /** Active members the task can go to (its current assignee excluded). */
  candidates: { id: string; full_name: string }[];
  /** The chosen receiver. The sheet closes at once; the caller talks to the server. */
  onTransfer: (toId: string) => void;
  className?: string;
};

/**
 * The "…" of a task sheet. From `sm` it is a menu; below, a bottom sheet of quick actions.
 * Both lead to the same member picker. Nothing here is on the task card itself.
 */
export function TransferTask({ task, candidates, onTransfer, className }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"actions" | "members">("actions");
  const [toId, setToId] = useState("");

  function show(next: "actions" | "members") {
    setStep(next);
    setToId("");
    setOpen(true);
  }

  const trigger = "absolute top-2 right-11";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className={cn(trigger, "hidden sm:inline-flex", className)} />}>
          <MoreHorizontal />
          <span className="sr-only">Thao tác khác</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => show("members")} className="h-9 px-2">
            <ArrowRightLeft />
            Chuyển công việc
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon-sm" onClick={() => show("actions")} className={cn(trigger, "sm:hidden", className)}>
        <MoreHorizontal />
        <span className="sr-only">Thao tác khác</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {step === "actions" ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 leading-snug">{task.title}</DialogTitle>
                <DialogDescription>Thao tác nhanh</DialogDescription>
              </DialogHeader>
              <button
                type="button"
                onClick={() => setStep("members")}
                className="flex h-12 w-full items-center gap-3 rounded-xl border bg-surface px-4 text-left font-medium outline-none transition-colors duration-(--duration-fast) hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ArrowRightLeft className="size-4 text-muted-foreground" />
                Chuyển công việc
              </button>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 leading-snug">Chuyển công việc</DialogTitle>
                <DialogDescription>“{task.title}” — deadline, ghi chú và lịch sử được giữ nguyên.</DialogDescription>
              </DialogHeader>
              {candidates.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-caption text-muted-foreground">Chưa có thành viên nào khác để chuyển.</p>
              ) : (
                <div role="radiogroup" aria-label="Người nhận" className="space-y-2">
                  {candidates.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={toId === m.id}
                      onClick={() => setToId(m.id)}
                      className={cn(
                        "flex h-12 w-full items-center justify-between gap-3 rounded-xl border px-4 text-left font-medium outline-none transition-colors duration-(--duration-fast) focus-visible:ring-3 focus-visible:ring-ring/50",
                        toId === m.id ? "border-primary bg-primary-soft text-primary-soft-foreground" : "bg-surface hover:bg-muted",
                      )}
                    >
                      <span className="truncate">{m.full_name}</span>
                      {toId === m.id && <Check className="size-4 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
              <Button
                size="lg"
                className="h-11 w-full"
                disabled={!toId}
                onClick={() => {
                  setOpen(false);
                  onTransfer(toId);
                }}
              >
                Chuyển
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
