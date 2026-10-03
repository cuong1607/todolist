"use client";

import { useOptimistic, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Clock, Loader2, MessageSquareText, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatTimeLocal } from "@/lib/time";
import { fadeInUp, stagger, transition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";
import { saveTaskNote, setTaskDone } from "./actions";

export type TodayTask = Pick<
  Tables<"tasks">,
  "id" | "type" | "title" | "note" | "allow_employee_note" | "employee_note" | "due_at" | "status" | "completed_at"
>;

export function TodayList({ tasks }: { tasks: TodayTask[] }) {
  const [optimistic, setOptimistic] = useOptimistic(tasks, (state, update: { id: string; done: boolean }) =>
    state.map((t) => (t.id === update.id ? { ...t, status: update.done ? ("DONE" as const) : ("TODO" as const) } : t)),
  );
  const [, startTransition] = useTransition();

  const done = optimistic.filter((t) => t.status === "DONE").length;
  const total = optimistic.length;

  function toggle(task: TodayTask) {
    const next = task.status !== "DONE";
    startTransition(async () => {
      setOptimistic({ id: task.id, done: next });
      const result = await setTaskDone(task.id, next);
      if (!result.ok) toast.error(result.error);
      else if (next && done + 1 === total) toast.success("Xong hết việc hôm nay 🎉");
    });
  }

  return (
    <div className="space-y-4">
      <Progress done={done} total={total} />

      <motion.ul variants={stagger} initial="hidden" animate="visible" className="space-y-2">
        {optimistic.map((task) => (
          <motion.li key={task.id} variants={fadeInUp} layout transition={transition.normal}>
            <TaskCard task={task} onToggle={() => toggle(task)} />
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const complete = done === total && total > 0;

  return (
    <div className="rounded-xl border bg-surface p-4 shadow-card">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="font-medium">{complete ? "Hoàn thành tất cả!" : "Tiến độ hôm nay"}</p>
        <p className="text-caption text-muted-foreground">
          <span className="text-title text-foreground tabular-nums">{done}</span>/{total} việc
        </p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Tiến độ hôm nay"
      >
        <motion.div
          className={cn("h-full rounded-full", complete ? "bg-success" : "bg-primary")}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={transition.slow}
        />
      </div>
    </div>
  );
}

function TaskCard({ task, onToggle }: { task: TodayTask; onToggle: () => void }) {
  const done = task.status === "DONE";
  const overdue = !done && task.due_at !== null && new Date(task.due_at) < new Date();

  return (
    <div className={cn("rounded-xl border bg-surface p-3 shadow-card transition-colors duration-(--duration-normal)", done && "bg-muted/40")}>
      <div className="flex items-start gap-3">
        <motion.button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mở lại “${task.title}”` : `Hoàn thành “${task.title}”`}
          onClick={onToggle}
          whileTap={{ scale: 0.85 }}
          transition={transition.fast}
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 outline-none transition-colors duration-(--duration-normal) focus-visible:ring-3 focus-visible:ring-ring/50",
            done ? "border-success bg-success text-success-foreground" : "border-input hover:border-primary",
          )}
        >
          <AnimatePresence initial={false}>
            {done && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={transition.spring}
                className="flex"
              >
                <Check className="size-4" strokeWidth={3} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <div className="min-w-0 flex-1">
          <p className={cn("font-medium transition-colors duration-(--duration-normal)", done && "text-muted-foreground line-through")}>
            {task.title}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            {task.type === "FIXED" && (
              <span className="flex items-center gap-1 text-primary-soft-foreground">
                <Repeat className="size-3.5" />
                Cố định
              </span>
            )}
            {task.due_at && (
              <span className={cn("flex items-center gap-1", overdue && "font-medium text-danger")}>
                <Clock className="size-3.5" />
                {overdue ? "Quá hạn " : "Trước "}
                {formatTimeLocal(task.due_at)}
              </span>
            )}
            {done && task.completed_at && <span>Xong lúc {formatTimeLocal(task.completed_at)}</span>}
          </div>

          {task.note && <p className="mt-2 text-caption whitespace-pre-line text-muted-foreground">{task.note}</p>}

          {task.allow_employee_note && <NoteEditor taskId={task.id} initial={task.employee_note} />}
        </div>
      </div>
    </div>
  );
}

function NoteEditor({ taskId, initial }: { taskId: string; initial: string | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saving, startSaving] = useTransition();

  function save() {
    startSaving(async () => {
      const result = await saveTaskNote(taskId, value);
      if (result.ok) {
        toast.success("Đã lưu ghi chú");
        setOpen(false);
      } else toast.error(result.error);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-start gap-2 rounded-lg bg-muted px-3 py-2 text-left text-caption outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        {initial ? (
          <span className="whitespace-pre-line">{initial}</span>
        ) : (
          <span className="text-muted-foreground">Thêm ghi chú…</span>
        )}
      </button>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={transition.normal} className="mt-2 overflow-hidden">
      <textarea
        autoFocus
        rows={3}
        maxLength={1000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Ghi chú"
        placeholder="Ghi kết quả, số liệu…"
        className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button
          variant="ghost"
          size="lg"
          onClick={() => {
            setValue(initial ?? "");
            setOpen(false);
          }}
        >
          Huỷ
        </Button>
        <Button size="lg" onClick={save} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          Lưu ghi chú
        </Button>
      </div>
    </motion.div>
  );
}
