"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addDays, formatDay, fromDeadlineISO, todayLocal } from "@/lib/time";
import { cn } from "@/lib/utils";
import { createAdhocTask, updateAdhocTask, type AdhocFormState } from "./adhoc-actions";
import type { TodayTask } from "./today-list";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = quick create */
  task: TodayTask | null;
};

export function AdhocDialog({ open, onOpenChange, task }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "Sửa công việc" : "Thêm việc phát sinh"}</DialogTitle>
          <DialogDescription>{task ? "Đổi tên, dời deadline hoặc cập nhật ghi chú." : "Chỉ cần tên việc — deadline và ghi chú tuỳ chọn."}</DialogDescription>
        </DialogHeader>
        {/* key: fresh form per task / per open */}
        <AdhocForm key={`${task?.id ?? "new"}-${open}`} task={task} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type DueMode = "none" | "today" | "tomorrow" | "pick";

function initialDue(task: TodayTask | null): { mode: DueMode; date: string; time: string } {
  const today = todayLocal();
  if (!task?.due_at) return { mode: "none", date: today, time: "" };
  const { date, time } = fromDeadlineISO(task.due_at);
  const mode: DueMode = date === today ? "today" : date === addDays(today, 1) ? "tomorrow" : "pick";
  return { mode, date, time };
}

function AdhocForm({ task, onDone }: { task: TodayTask | null; onDone: () => void }) {
  const [state, action, pending] = useActionState<AdhocFormState, FormData>(task ? updateAdhocTask : createAdhocTask, {});
  const init = initialDue(task);
  const [mode, setMode] = useState<DueMode>(init.mode);
  const [pickedDate, setPickedDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [showNote, setShowNote] = useState(!!task?.note);

  useEffect(() => {
    if (state.ok) {
      toast.success(task ? "Đã lưu" : "Đã thêm việc");
      onDone();
    }
  }, [state.ok, state.nonce, task, onDone]);

  const today = todayLocal();
  const dueDate = mode === "none" ? "" : mode === "today" ? today : mode === "tomorrow" ? addDays(today, 1) : pickedDate;

  const chips: { value: DueMode; label: string }[] = [
    { value: "none", label: "Không deadline" },
    { value: "today", label: "Hôm nay" },
    { value: "tomorrow", label: "Ngày mai" },
    { value: "pick", label: mode === "pick" && pickedDate ? formatDay(pickedDate) : "Chọn ngày" },
  ];

  return (
    <form action={action} className="space-y-5">
      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-caption text-danger-soft-foreground">
          {state.error}
        </p>
      )}
      {task && <input type="hidden" name="id" value={task.id} />}
      <input type="hidden" name="due_date" value={dueDate} />
      <input type="hidden" name="due_time" value={mode === "none" ? "" : time} />

      <div className="space-y-2">
        <Label htmlFor="a-title">Tên công việc</Label>
        <Input
          id="a-title"
          name="title"
          required
          maxLength={200}
          autoFocus={!task}
          defaultValue={task?.title}
          placeholder="VD: Gọi lại cho khách về đơn #1024"
          className="h-11 text-base"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Deadline</legend>
        <div role="radiogroup" aria-label="Deadline" className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={mode === c.value}
              onClick={() => setMode(c.value)}
              className={cn(
                "h-10 rounded-full border px-4 text-caption font-medium transition-colors duration-(--duration-fast) outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                mode === c.value ? "border-primary bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:bg-muted",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {mode !== "none" && (
          <div className="flex flex-wrap items-end gap-3 pt-1">
            {mode === "pick" && (
              <div className="space-y-1">
                <Label htmlFor="a-date" className="text-caption text-muted-foreground">
                  Ngày
                </Label>
                <Input
                  id="a-date"
                  type="date"
                  min={today}
                  value={pickedDate}
                  onChange={(e) => setPickedDate(e.target.value)}
                  required
                  className="h-11 w-44 text-base"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="a-time" className="text-caption text-muted-foreground">
                Giờ (tuỳ chọn)
              </Label>
              <Input id="a-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 w-36 text-base" />
            </div>
            {!time && <p className="pb-3 text-micro text-muted-foreground">Không chọn giờ = trước hết ngày</p>}
          </div>
        )}
      </fieldset>

      {showNote ? (
        <div className="space-y-2">
          <Label htmlFor="a-note">Ghi chú</Label>
          <textarea
            id="a-note"
            name="note"
            rows={3}
            maxLength={2000}
            defaultValue={task?.note ?? ""}
            autoFocus={!task}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </div>
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="flex items-center gap-1 text-caption font-medium text-primary hover:underline">
          <Plus className="size-4" />
          Thêm ghi chú
        </button>
      )}

      <Button type="submit" size="lg" disabled={pending} className="h-11 w-full">
        {pending && <Loader2 className="animate-spin" />}
        {task ? "Lưu thay đổi" : "Thêm việc"}
      </Button>
    </form>
  );
}
