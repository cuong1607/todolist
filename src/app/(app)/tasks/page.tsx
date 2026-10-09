import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LayoutList, Send } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LinkPending } from "@/components/link-pending";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getTeamMembers } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateShort, localDateOf, startOfDayISO, todayLocal } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TODAY_TASK_COLUMNS, type TodayTask } from "../today/task-types";
import { HistoryView, type HistoryDay } from "./history-view";
import { TaskListView, type TaskGroup } from "./task-list-view";

export const metadata: Metadata = { title: "Công việc" };

/** Days per page. History is paged by date window, so a page never splits a day. */
const WINDOW_DAYS = 14;
/** Finished tasks kept on "Đã giao" — enough to see what came back recently. */
const ASSIGNED_DONE_LIMIT = 30;

const TABS = [
  { key: "mine", label: "Của tôi", description: "Việc bạn đang phụ trách." },
  { key: "assigned", label: "Đã giao", description: "Việc bạn tạo và giao cho người khác." },
  { key: "done", label: "Đã hoàn thành", description: "Lịch sử công việc của bạn." },
] as const;
type Tab = (typeof TABS)[number]["key"];

type Viewer = { id: string; isAdmin: boolean };

const byDeadline = (a: TodayTask, b: TodayTask) =>
  (a.deadline_at ?? "9999").localeCompare(b.deadline_at ?? "9999") || a.created_at.localeCompare(b.created_at);

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const me = await requireUser();
  const params = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === params.tab)?.key ?? "mine";
  const viewer: Viewer = { id: me.id, isAdmin: me.role === "ADMIN" };

  return (
    <>
      <PageHeader title="Công việc" description={TABS.find((t) => t.key === tab)?.description} />

      <nav aria-label="Danh sách công việc" className="-mx-gutter mb-4 overflow-x-auto px-gutter md:mx-0 md:px-0">
        <ul className="flex w-max gap-2 pb-1">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={t.key === "mine" ? "/tasks" : `/tasks?tab=${t.key}`}
                scroll={false}
                aria-current={t.key === tab ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-1.5 rounded-full border px-4 text-caption font-medium whitespace-nowrap outline-none transition-colors duration-(--duration-fast) focus-visible:ring-3 focus-visible:ring-ring/50",
                  t.key === tab ? "border-primary bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:bg-muted",
                )}
              >
                {t.label}
                <LinkPending />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "mine" ? <MineTab viewer={viewer} /> : tab === "assigned" ? <AssignedTab viewer={viewer} /> : <DoneTab viewer={viewer} before={params.before} />}
    </>
  );
}

/** What is on my plate now: today's unfinished fixed tasks + every open ad-hoc task. Ticking stays on Today. */
async function MineTab({ viewer }: { viewer: Viewer }) {
  const supabase = await createClient();
  const [{ data: rows, error }, members] = await Promise.all([
    supabase
      .from("tasks")
      .select(TODAY_TASK_COLUMNS)
      .eq("assignee_id", viewer.id)
      .eq("completed", false)
      .or(`and(type.eq.FIXED,task_date.eq.${todayLocal()}),type.eq.ADHOC`)
      .order("sort_order"),
    getTeamMembers(),
  ]);
  if (error) throw new Error("Không tải được công việc");

  const groups: TaskGroup[] = [
    { key: "fixed", title: "Cố định hôm nay", tasks: rows.filter((t) => t.type === "FIXED") },
    { key: "adhoc", title: "Phát sinh", tasks: rows.filter((t) => t.type === "ADHOC").sort(byDeadline) },
  ].filter((g) => g.tasks.length > 0);

  if (groups.length === 0) {
    return (
      <EmptyState icon={<LayoutList />} title="Không còn việc nào đang mở" description="Việc mới của bạn sẽ hiện ở đây.">
        <Button size="lg" nativeButton={false} render={<Link href="/today" />}>
          Đến trang Hôm nay
        </Button>
      </EmptyState>
    );
  }
  return <TaskListView groups={groups} members={members} viewer={viewer} show="assigner" />;
}

/**
 * Tasks I created for someone else. `created_by = me` is explicit — RLS would show an admin
 * everything — so nothing else of the assignee's is ever listed here.
 */
async function AssignedTab({ viewer }: { viewer: Viewer }) {
  const supabase = await createClient();
  const assigned = () =>
    supabase.from("tasks").select(TODAY_TASK_COLUMNS).eq("type", "ADHOC").eq("created_by", viewer.id).neq("assignee_id", viewer.id);
  const [{ data: open, error: openError }, { data: done, error: doneError }, members] = await Promise.all([
    assigned().eq("completed", false),
    assigned().eq("completed", true).order("completed_at", { ascending: false }).limit(ASSIGNED_DONE_LIMIT),
    getTeamMembers(),
  ]);
  if (openError || doneError) throw new Error("Không tải được việc đã giao");

  const groups: TaskGroup[] = [
    { key: "open", title: "Đang làm", tasks: open.sort(byDeadline) },
    { key: "done", title: "Đã xong", tasks: done },
  ].filter((g) => g.tasks.length > 0);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<Send />}
        title="Bạn chưa giao việc nào"
        description="Khi thêm việc ở trang Hôm nay, chọn người nhận ở mục “Giao cho” để theo dõi tại đây."
      />
    );
  }
  return <TaskListView groups={groups} members={members} viewer={viewer} show="assignee" />;
}

async function DoneTab({ viewer, before }: { viewer: Viewer; before: string | string[] | undefined }) {
  const today = todayLocal();

  // ?before=YYYY-MM-DD → the window ends the day before. Anything invalid or in the future = latest.
  const parsed = z.iso.date().safeParse(before);
  const to = parsed.success && parsed.data <= today ? addDays(parsed.data, -1) : today;
  const from = addDays(to, -(WINDOW_DAYS - 1));
  const rangeStart = startOfDayISO(from);
  const rangeEnd = startOfDayISO(addDays(to, 1));

  const supabase = await createClient();
  // History = fixed tasks of past days (done or missed) + anything completed.
  // Filter by the session user explicitly: RLS alone would let an admin see everyone's tasks.
  const [{ data: rows, error }, { data: older }, members] = await Promise.all([
    supabase
      .from("tasks")
      .select(TODAY_TASK_COLUMNS)
      .eq("assignee_id", viewer.id)
      .or(
        [
          `and(type.eq.FIXED,task_date.gte.${from},task_date.lte.${to})`,
          `and(type.eq.ADHOC,completed_at.gte.${rangeStart},completed_at.lt.${rangeEnd})`,
        ].join(","),
      )
      .order("sort_order")
      .order("completed_at"),
    supabase
      .from("tasks")
      .select("id")
      .eq("assignee_id", viewer.id)
      .or(`and(type.eq.FIXED,task_date.lt.${from}),and(type.eq.ADHOC,completed_at.lt.${rangeStart})`)
      .limit(1),
    getTeamMembers(),
  ]);
  if (error) throw new Error("Không tải được lịch sử công việc");

  const days = groupByDay(rows, today);
  const all = days.flatMap((d) => d.tasks);
  const done = all.filter((t) => t.completed).length;
  const missed = all.length - done;

  const newerHref =
    to < today ? (addDays(to, WINDOW_DAYS) >= today ? "/tasks?tab=done" : `/tasks?tab=done&before=${addDays(to, WINDOW_DAYS + 1)}`) : null;
  const olderHref = older?.length ? `/tasks?tab=done&before=${from}` : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="font-medium">
          {formatDateShort(from)} – {formatDateShort(to)}
        </p>
        {all.length > 0 && (
          <p className="text-caption text-muted-foreground">
            <span className="font-semibold text-success">{done}</span> đã xong
            {missed > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-danger">{missed}</span> bỏ lỡ
              </>
            )}
          </p>
        )}
      </div>

      {days.length === 0 ? (
        <EmptyState icon={<LayoutList />} title="Chưa có lịch sử" description="Việc bạn hoàn thành sẽ được lưu lại ở đây.">
          <Button size="lg" nativeButton={false} render={<Link href="/today" />}>
            Đến trang Hôm nay
          </Button>
        </EmptyState>
      ) : (
        <HistoryView days={days} members={members} />
      )}

      {(olderHref || newerHref) && (
        <nav aria-label="Chuyển khoảng thời gian" className="mt-6 flex items-center justify-between gap-3">
          {olderHref ? (
            <Link href={olderHref} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
              <ChevronLeft />
              Cũ hơn
            </Link>
          ) : (
            <span />
          )}
          {newerHref && (
            <Link href={newerHref} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
              Mới hơn
              <ChevronRight />
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

/** FIXED belongs to its task_date; ADHOC to the day it was completed. Newest day first. */
function groupByDay(rows: TodayTask[], today: string): HistoryDay[] {
  const byDate = new Map<string, TodayTask[]>();
  for (const task of rows) {
    const date = task.type === "FIXED" ? task.task_date : task.completed_at && localDateOf(task.completed_at);
    if (!date) continue;
    // Today's unfinished fixed tasks are still in progress, not history.
    if (date === today && !task.completed) continue;
    const list = byDate.get(date);
    if (list) list.push(task);
    else byDate.set(date, [task]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, tasks]) => ({
      date,
      // Fixed checklist first (query order = sort_order), then ad-hoc in completion order.
      tasks: [...tasks.filter((t) => t.type === "FIXED"), ...tasks.filter((t) => t.type === "ADHOC")],
    }));
}
