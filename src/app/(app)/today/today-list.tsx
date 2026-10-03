"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CalendarCheck, Check, ChevronDown, Clock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Fab } from "@/components/shell/fab";
import { createClient } from "@/lib/supabase/client";
import { deriveStatus, type DisplayStatus } from "@/lib/task-status";
import { formatDeadline, formatTimeLocal, localDateOf, todayLocal } from "@/lib/time";
import { ease, transition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";
import { setTaskDone } from "./actions";
import { AdhocDialog } from "./adhoc-dialog";
import { FixedTaskDialog } from "./fixed-task-dialog";
import { toTodayTask, type TodayTask } from "./task-types";

/** Phase 6 spec: interaction animations stay within 150–250ms. */
const cardTransition = { duration: 0.2, ease: ease.outSoft };
/** A completed ad-hoc card stays put briefly before moving to "Đã xong", so it never jumps from under the thumb. */
const SETTLE_MS = 700;

type SectionKey = "fixed" | "dueToday" | "overdue" | "backlog" | "upcoming" | "done";

const SECTIONS: { key: SectionKey; title: string; hint?: string; collapsible?: boolean }[] = [
  { key: "fixed", title: "Công việc cố định" },
  { key: "dueToday", title: "Đến hạn hôm nay" },
  { key: "overdue", title: "Quá hạn" },
  { key: "backlog", title: "Việc đang tồn", hint: "Không có deadline" },
  { key: "upcoming", title: "Sắp tới", collapsible: true },
  { key: "done", title: "Đã xong", collapsible: true },
];

function sectionOf(task: TodayTask, status: DisplayStatus): SectionKey {
  if (task.type === "FIXED") return "fixed"; // done fixed tasks stay in their checklist
  switch (status) {
    case "COMPLETED":
      return "done";
    case "OVERDUE":
      return "overdue";
    case "UPCOMING":
      return "upcoming";
    case "TODAY":
      return task.deadline_at ? "dueToday" : "backlog";
  }
}

const byDeadline = (a: TodayTask, b: TodayTask) =>
  (a.deadline_at ?? "9999").localeCompare(b.deadline_at ?? "9999") || a.created_at.localeCompare(b.created_at);

/** Whether a row belongs on today's screen at all. */
function belongsToday(task: TodayTask, today: string) {
  if (task.type === "FIXED") return task.task_date === today;
  return !task.completed || (task.completed_at !== null && localDateOf(task.completed_at) === today);
}

/** Re-render every minute so tasks flip to "overdue" while the page is open. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

type Props = {
  initialTasks: TodayTask[];
  userId: string;
  greeting: string;
  dateLabel: string;
};

export function TodayView({ initialTasks, userId, greeting, dateLabel }: Props) {
  const router = useRouter();
  const now = useNow();
  const today = todayLocal(now);

  // The screen owns its task state: optimistic ticks + Realtime merges, no page reloads.
  const [tasks, setTasks] = useState(initialTasks);
  const [synced, setSynced] = useState(initialTasks);
  if (synced !== initialTasks) {
    setSynced(initialTasks);
    setTasks(initialTasks);
  }

  // Ids with a request in flight: ignore Realtime echoes for them until the server answers.
  const inFlight = useRef(new Set<string>());
  const [settling, setSettling] = useState<ReadonlySet<string>>(new Set());
  const [adhocDialog, setAdhocDialog] = useState<{ open: boolean; task: TodayTask | null }>({ open: false, task: null });
  const [fixedDialog, setFixedDialog] = useState<{ open: boolean; task: TodayTask | null }>({ open: false, task: null });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const upsert = useCallback((row: TodayTask) => {
    setTasks((prev) => {
      const keep = belongsToday(row, todayLocal());
      const exists = prev.some((t) => t.id === row.id);
      if (!keep) return prev.filter((t) => t.id !== row.id);
      return exists ? prev.map((t) => (t.id === row.id ? row : t)) : [...prev, row];
    });
  }, []);

  // ---------- Realtime: sync changes made elsewhere (another device, another tab, the 00:05 job) ----------
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Authenticate the socket BEFORE subscribing, otherwise Realtime evaluates RLS as anon
      // and silently delivers nothing. (supabase-js keeps it updated on token refresh.)
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel(`today:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `assignee_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as Partial<Tables<"tasks">>).id;
            if (id) setTasks((prev) => prev.filter((t) => t.id !== id));
            return;
          }
          const row = toTodayTask(payload.new as Tables<"tasks">);
          if (inFlight.current.has(row.id)) return;
          upsert(row);
        },
      )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, upsert]);

  // Catch up after the tab was in the background (Realtime may have missed events) and at midnight.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);
  const loadedFor = useRef(today);
  useEffect(() => {
    if (today !== loadedFor.current) {
      loadedFor.current = today;
      router.refresh();
    }
  }, [today, router]);

  // ---------- grouping ----------
  const sections = useMemo(() => {
    const groups: Record<SectionKey, TodayTask[]> = { fixed: [], dueToday: [], overdue: [], backlog: [], upcoming: [], done: [] };
    for (const t of tasks) {
      // While settling, place a just-completed card where it was before.
      const placeAs = settling.has(t.id) ? { ...t, completed: false } : t;
      groups[sectionOf(placeAs, deriveStatus(placeAs, now))].push(t);
    }
    groups.fixed.sort((a, b) => a.sort_order - b.sort_order || byDeadline(a, b));
    groups.dueToday.sort(byDeadline);
    groups.overdue.sort(byDeadline);
    groups.upcoming.sort(byDeadline);
    groups.backlog.sort((a, b) => a.created_at.localeCompare(b.created_at));
    groups.done.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
    return groups;
  }, [tasks, settling, now]);

  // "x/y công việc hoàn thành": today's fixed + ad-hoc due today or late + ad-hoc finished today.
  const todaysWork = [...sections.fixed, ...sections.dueToday, ...sections.overdue, ...sections.done];
  const done = todaysWork.filter((t) => t.completed).length;
  const total = todaysWork.length;

  // ---------- actions ----------
  async function toggle(task: TodayTask, next: boolean, { undoable = true } = {}) {
    const optimistic: TodayTask = { ...task, completed: next, completed_at: next ? new Date().toISOString() : null };
    inFlight.current.add(task.id);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? optimistic : t)));
    if (next && task.type === "ADHOC") {
      setSettling((s) => new Set(s).add(task.id));
      setTimeout(() => {
        setSettling((s) => {
          const copy = new Set(s);
          copy.delete(task.id);
          return copy;
        });
      }, SETTLE_MS);
    }

    const result = await setTaskDone(task.id, next);
    inFlight.current.delete(task.id);

    if (!result.ok) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      toast.error(result.error);
      return;
    }
    upsert(result.task);
    if (next && undoable) {
      toast.success(`Đã xong “${task.title}”`, {
        duration: 3000,
        action: { label: "Hoàn tác", onClick: () => void toggle(result.task, false, { undoable: false }) },
      });
    }
  }

  /** After create/edit: merge, and open the section it landed in so the user sees the result. */
  function handleSaved(row: TodayTask) {
    upsert(row);
    const key = sectionOf(row, deriveStatus(row, new Date()));
    if (SECTIONS.find((s) => s.key === key)?.collapsible) setExpanded((e) => ({ ...e, [key]: true }));
  }

  const openCreate = () => setAdhocDialog({ open: true, task: null });
  const openTask = (task: TodayTask) =>
    task.type === "ADHOC" ? setAdhocDialog({ open: true, task }) : setFixedDialog({ open: true, task });

  const allDone = total > 0 && done === total;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="space-y-6">
      {/* ---------- header: greeting · date · progress ---------- */}
      <header className="space-y-4">
        <div>
          <h2 className="text-display">{greeting}</h2>
          <p className="mt-1 text-muted-foreground">{dateLabel}</p>
        </div>

        <div className="rounded-2xl border bg-surface p-4 shadow-card">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <p className="font-medium">
              <span className="text-title tabular-nums">{done}</span>
              <span className="text-muted-foreground">/{total}</span> công việc hoàn thành
            </p>
            <AnimatePresence initial={false}>
              {allDone && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={cardTransition}
                  className="text-caption font-semibold text-success"
                >
                  Xong hết rồi! 🎉
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-label="Tiến độ hôm nay"
          >
            <motion.div
              className={cn("h-full rounded-full", allDone ? "bg-success" : "bg-primary")}
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.25, ease: ease.outSoft }}
            />
          </div>
        </div>

        <Button size="lg" onClick={openCreate} className="hidden md:inline-flex">
          <Plus />
          Thêm việc
        </Button>
      </header>

      {/* ---------- sections ---------- */}
      {tasks.length === 0 ? (
        <EmptyState icon={<CalendarCheck />} title="Hôm nay chưa có việc nào" description="Có việc phát sinh? Thêm nhanh để không quên.">
          <Button size="lg" onClick={openCreate}>
            <Plus />
            Thêm việc
          </Button>
        </EmptyState>
      ) : (
        SECTIONS.map(({ key, title, hint, collapsible }) => {
          const items = sections[key];
          if (items.length === 0) return null;
          const open = !collapsible || Boolean(expanded[key]);
          return (
            <section key={key} aria-labelledby={`section-${key}`} className="space-y-2">
              <SectionHeader
                id={`section-${key}`}
                title={title}
                hint={hint}
                count={key === "fixed" ? `${items.filter((t) => t.completed).length}/${items.length}` : String(items.length)}
                danger={key === "overdue"}
                collapsible={collapsible}
                open={open}
                onToggle={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
              />
              <AnimatePresence initial={false}>
                {open && (
                  <motion.ul
                    initial={collapsible ? { height: 0, opacity: 0 } : false}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={cardTransition}
                    className={cn("space-y-2", collapsible && "overflow-hidden")}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {items.map((task) => (
                        <motion.li
                          key={task.id}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
                          transition={cardTransition}
                        >
                          <TaskCard
                            task={task}
                            status={deriveStatus(task, now)}
                            now={now}
                            onToggle={() => void toggle(task, !task.completed)}
                            onOpen={() => openTask(task)}
                          />
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </motion.ul>
                )}
              </AnimatePresence>
            </section>
          );
        })
      )}

      <Fab icon={Plus} label="Thêm việc" extended onClick={openCreate} />
      <AdhocDialog
        open={adhocDialog.open}
        task={adhocDialog.task}
        onOpenChange={(open) => setAdhocDialog((d) => ({ ...d, open }))}
        onSaved={handleSaved}
      />
      <FixedTaskDialog
        open={fixedDialog.open}
        task={fixedDialog.task ? (tasks.find((t) => t.id === fixedDialog.task!.id) ?? fixedDialog.task) : null}
        onOpenChange={(open) => setFixedDialog((d) => ({ ...d, open }))}
        onToggle={(task) => void toggle(task, !task.completed)}
        onSaved={upsert}
      />
    </div>
  );
}

type SectionHeaderProps = {
  id: string;
  title: string;
  hint?: string;
  count: string;
  danger?: boolean;
  collapsible?: boolean;
  open: boolean;
  onToggle: () => void;
};

function SectionHeader({ id, title, hint, count, danger, collapsible, open, onToggle }: SectionHeaderProps) {
  const content = (
    <>
      <span id={id} className={cn("text-caption font-semibold tracking-wide uppercase", danger ? "text-danger" : "text-muted-foreground")}>
        {title}
      </span>
      <span className="text-caption text-muted-foreground tabular-nums">{count}</span>
      {hint && <span className="text-micro text-muted-foreground">· {hint}</span>}
    </>
  );

  if (!collapsible) return <h3 className="flex items-baseline gap-2 px-1">{content}</h3>;

  return (
    <h3>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-2 rounded-lg px-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {content}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={cardTransition} className="ml-auto flex text-muted-foreground">
          <ChevronDown className="size-4" />
        </motion.span>
      </button>
    </h3>
  );
}

type TaskCardProps = {
  task: TodayTask;
  status: DisplayStatus;
  now: Date;
  onToggle: () => void;
  onOpen: () => void;
};

/** Minimal card: checkbox · title · deadline · one-line note preview. Everything else lives in the detail sheet. */
function TaskCard({ task, status, now, onToggle, onOpen }: TaskCardProps) {
  const done = task.completed;
  const overdue = status === "OVERDUE";
  const notePreview = task.type === "FIXED" ? (task.employee_note ?? task.note) : task.note;

  let deadline: string | null = null;
  if (task.deadline_at) {
    deadline = task.type === "FIXED" ? formatTimeLocal(task.deadline_at) : formatDeadline(task.deadline_at, now);
    deadline = overdue ? `Quá hạn · ${deadline}` : task.type === "FIXED" ? `Trước ${deadline}` : deadline;
  } else if (overdue) {
    deadline = "Quá hạn";
  }

  return (
    <div
      className={cn(
        "flex items-start rounded-xl border bg-surface shadow-card transition-colors duration-200",
        done && "bg-muted/40 shadow-none",
        overdue && !done && "border-danger/30",
      )}
    >
      {/* 44px hit area around a 28px circle — easy to hit one-handed. */}
      <motion.button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mở lại “${task.title}”` : `Hoàn thành “${task.title}”`}
        onClick={onToggle}
        whileTap={{ scale: 0.85 }}
        transition={{ duration: 0.15 }}
        className="flex size-12 shrink-0 items-center justify-center rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full border-2 transition-colors duration-200",
            done ? "border-success bg-success text-success-foreground" : overdue ? "border-danger/60" : "border-input",
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
        </span>
      </motion.button>

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Chi tiết “${task.title}”`}
        className="min-w-0 flex-1 rounded-r-xl py-3 pr-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <p className={cn("font-medium transition-colors duration-200", done && "text-muted-foreground line-through")}>{task.title}</p>
        {deadline && (
          <p className={cn("mt-0.5 flex items-center gap-1 text-caption text-muted-foreground", overdue && !done && "font-medium text-danger")}>
            <Clock className="size-3.5 shrink-0" />
            {deadline}
          </p>
        )}
        {notePreview && <p className="mt-1 line-clamp-1 text-caption text-muted-foreground">{notePreview}</p>}
      </button>
    </div>
  );
}
