"use client";

import { useState, useTransition } from "react";
import { Check, Clock, Loader2, Repeat, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatTimeLocal } from "@/lib/time";
import { saveTaskNote } from "./actions";
import type { TodayTask } from "./task-types";

type Props = {
  open: boolean;
  task: TodayTask | null;
  onOpenChange: (open: boolean) => void;
  onToggle: (task: TodayTask) => void;
  onSaved: (task: TodayTask) => void;
};

/** Detail sheet for a fixed task: instructions, optional employee note, complete/reopen. Read-only otherwise. */
export function FixedTaskDialog({ open, task, onOpenChange, onToggle, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {task && (
          <>
            <DialogHeader>
              <DialogTitle>{task.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                  <Repeat className="size-3.5" />
                  Việc cố định hôm nay
                </span>
                {task.deadline_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    Trước {formatTimeLocal(task.deadline_at)}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            {task.note && (
              <div className="rounded-xl bg-muted px-4 py-3">
                <p className="mb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Hướng dẫn</p>
                <p className="text-body whitespace-pre-line">{task.note}</p>
              </div>
            )}

            {task.allow_employee_note && (
              <NoteForm key={task.id} task={task} onSaved={onSaved} />
            )}

            <Button
              size="lg"
              variant={task.completed ? "outline" : "default"}
              className="h-12 w-full text-base"
              onClick={() => {
                onToggle(task);
                onOpenChange(false);
              }}
            >
              {task.completed ? <RotateCcw /> : <Check />}
              {task.completed ? "Mở lại" : "Hoàn thành"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NoteForm({ task, onSaved }: { task: TodayTask; onSaved: (task: TodayTask) => void }) {
  const [value, setValue] = useState(task.employee_note ?? "");
  const [saving, startSaving] = useTransition();
  const dirty = value.trim() !== (task.employee_note ?? "");

  function save() {
    startSaving(async () => {
      const result = await saveTaskNote(task.id, value);
      if (result.ok) {
        onSaved(result.task);
        toast.success("Đã lưu ghi chú");
      } else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="fixed-note">Ghi chú của bạn</Label>
      <textarea
        id="fixed-note"
        rows={3}
        maxLength={1000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ghi kết quả, số liệu…"
        className="w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      />
      <div className="flex justify-end">
        <Button variant="secondary" size="lg" onClick={save} disabled={saving || !dirty}>
          {saving && <Loader2 className="animate-spin" />}
          Lưu ghi chú
        </Button>
      </div>
    </div>
  );
}
