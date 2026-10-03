"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarCheck, Check, Clock, History, Loader2, MessageSquareText, Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Fab } from "@/components/shell/fab";
import { deriveStatus, type DisplayStatus } from "@/lib/task-status";
import { formatDay, formatDeadline, formatTimeLocal, localDateOf, todayLocal } from "@/lib/time";
import { transition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";
import { saveTaskNote, setTaskDone } from "./actions";
import { AdhocDialog } from "./adhoc-dialog";

export type TodayTask = Pick<
  Tables<"tasks">,
  | "id"
  | "type"
  | "title"
  | "note"
  | "allow_employee_note"
  | "employee_note"
  | "deadline_at"
  | "completed"
  | "completed_at"
  | "task_date"
  | "sort_order"
  | "created_at"
>;

type SectionKey = "overdue" | "today" | "backlog" | "upcoming" | "done";

const SECTIONS: { key: SectionKey; title: string; hint?: string }[] = [
  { key: "overdue", title: "Quá hạn" },
  { key: "today", title: "Hôm nay" },
  { key: "backlog", title: "Việc đang tồn", hint: "Không có deadline" },
  { key: "upcoming", title: "Sắp tới" },
  { key: "done", title: "Đã xong" },
];

function sectionOf(task: TodayTask, status: DisplayStatus): SectionKey {
  switch (status) {
    case "COMPLETED":
      return "done";
    case "OVERDUE":
      return "overdue";
    case "UPCOMING":
      return "upcoming";
    case "TODAY":
      return task.type === "ADHOC" && !task.deadline_at ? "backlog" : "today";
  }
}

const byDue = (a: TodayTask, b: TodayTask) =>
  (a.deadline_at ?? "9999").localeCompare(b.deadline_at ?? "9999") || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

/** "Hôm qua" → "hôm qua" mid-sentence; leave "T5, 1/10" alone. */
const lowerRelative = (label: string) => (/^(Hôm|Ngày)/.test(label) ? label.toLowerCase() : label);

/** Re-render every minute so tasks flip to "overdue" while the page is open. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TodayList({ tasks }: { tasks: TodayTask[] }) {
  const now = useNow();
  const [optimistic, setOptimistic] = useOptimistic(tasks, (state, update: { id: string; done: boolean }) =>
    state.map((t) =>
      t.id === update.id
        ? { ...t, completed: update.done, completed_at: update.done ? new Date().toISOString() : null }
        : t,
    ),
  );
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; task: TodayTask | null }>({ open: false, task: null });

  const sections = useMemo(() => {
    const groups: Record<SectionKey, TodayTask[]> = { overdue: [], today: [], backlog: [], upcoming: [], done: [] };
    for (const t of optimistic) groups[sectionOf(t, deriveStatus(t, now))].push(t);
    groups.overdue.sort(byDue);
    groups.today.sort(byDue);
    groups.upcoming.sort(byDue);
    groups.backlog.sort((a, b) => a.created_at.localeCompare(b.created_at));
    groups.done.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
    return groups;
  }, [optimistic, now]);

  // Today's workload = what's due today or already late, plus what got done today.
  const done = sections.done.length;
  const total = done + sections.overdue.length + sections.today.length;

  function toggle(task: TodayTask) {
    const next = !task.completed;
    startTransition(async () => {
      setOptimistic({ id: task.id, done: next });
      const result = await setTaskDone(task.id, next);
      if (!result.ok) toast.error(result.error);
      else if (next && done + 1 === total && total > 0) toast.success("Xong hết việc hôm nay 🎉");
    });
  }

  const openCreate = () => setDialog({ open: true, task: null });
  const openEdit = (task: TodayTask) => setDialog({ open: true, task });

  return (
    <div className="space-y-6">
      <div className="flex items-stretch gap-3">
        <div className="flex-1">
          <Progress done={done} total={total} />
        </div>
        <Button size="lg" onClick={openCreate} className="hidden h-auto px-5 md:inline-flex">
          <Plus />
          Thêm việc
        </Button>
      </div>

      {optimistic.length === 0 ? (
        <EmptyState icon={<CalendarCheck />} title="Hôm nay không có việc nào" description="Có việc phát sinh? Thêm nhanh để không quên.">
          <Button size="lg" onClick={openCreate}>
            <Plus />
            Thêm việc
          </Button>
        </EmptyState>
      ) : (
        SECTIONS.map(({ key, title, hint }) =>
          sections[key].length === 0 ? null : (
            <section key={key} aria-labelledby={`section-${key}`} className="space-y-2">
              <h3 id={`section-${key}`} className="flex items-baseline gap-2 px-1">
                <span className={cn("text-caption font-semibold tracking-wide uppercase", key === "overdue" ? "text-danger" : "text-muted-foreground")}>
                  {title}
                </span>
                <span className="text-caption text-muted-foreground tabular-nums">{sections[key].length}</span>
                {hint && <span className="text-micro text-muted-foreground">· {hint}</span>}
              </h3>
              <ul className="space-y-2">
                <AnimatePresence initial={false} mode="popLayout">
                  {sections[key].map((task) => (
                    <motion.li
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={transition.normal}
                    >
                      <TaskCard
                        task={task}
                        status={deriveStatus(task, now)}
                        now={now}
                        onToggle={() => toggle(task)}
                        onEdit={task.type === "ADHOC" ? () => openEdit(task) : undefined}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ),
        )
      )}

      <Fab icon={Plus} label="Thêm việc phát sinh" onClick={openCreate} />
      <AdhocDialog open={dialog.open} task={dialog.task} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
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

type TaskCardProps = {
  task: TodayTask;
  status: DisplayStatus;
  now: Date;
  onToggle: () => void;
  onEdit?: () => void;
};

function TaskCard({ task, status, now, onToggle, onEdit }: TaskCardProps) {
  const done = status === "COMPLETED";
  const overdue = status === "OVERDUE";
  const createdOn = localDateOf(task.created_at);
  const carriedOver = task.type === "ADHOC" && !done && createdOn < todayLocal(now);

  const body = (
    <>
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
        {task.deadline_at && (
          <span className={cn("flex items-center gap-1", overdue && "font-medium text-danger")}>
            <Clock className="size-3.5" />
            {overdue && "Quá hạn · "}
            {task.type === "FIXED" ? `Trước ${formatTimeLocal(task.deadline_at)}` : formatDeadline(task.deadline_at, now)}
          </span>
        )}
        {carriedOver && (
          <span className="flex items-center gap-1 text-warning-soft-foreground">
            <History className="size-3.5" />
            Tồn từ {lowerRelative(formatDay(createdOn, now))}
          </span>
        )}
        {done && task.completed_at && <span>Xong lúc {formatTimeLocal(task.completed_at)}</span>}
      </div>
      {task.note && <p className="mt-2 line-clamp-3 text-caption whitespace-pre-line text-muted-foreground">{task.note}</p>}
    </>
  );

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface p-3 shadow-card transition-colors duration-(--duration-normal)",
        done && "bg-muted/40",
        overdue && "border-danger/30",
      )}
    >
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
            done ? "border-success bg-success text-success-foreground" : overdue ? "border-danger/60 hover:border-danger" : "border-input hover:border-primary",
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
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Sửa “${task.title}”`}
              className="block w-full rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {body}
            </button>
          ) : (
            body
          )}

          {task.type === "FIXED" && task.allow_employee_note && <NoteEditor taskId={task.id} initial={task.employee_note} />}
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
        {initial ? <span className="whitespace-pre-line">{initial}</span> : <span className="text-muted-foreground">Thêm ghi chú…</span>}
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
