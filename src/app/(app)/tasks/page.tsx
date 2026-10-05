import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LayoutList } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDateShort, localDateOf, startOfDayISO, todayLocal } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TODAY_TASK_COLUMNS, type TodayTask } from "../today/task-types";
import { HistoryView, type HistoryDay } from "./history-view";

export const metadata: Metadata = { title: "Công việc" };

/** Days per page. History is paged by date window, so a page never splits a day. */
const WINDOW_DAYS = 14;

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const me = await requireUser();
  const today = todayLocal();

  // ?before=YYYY-MM-DD → the window ends the day before. Anything invalid or in the future = latest.
  const { before } = await searchParams;
  const parsed = z.iso.date().safeParse(before);
  const to = parsed.success && parsed.data <= today ? addDays(parsed.data, -1) : today;
  const from = addDays(to, -(WINDOW_DAYS - 1));
  const rangeStart = startOfDayISO(from);
  const rangeEnd = startOfDayISO(addDays(to, 1));

  const supabase = await createClient();
  // History = fixed tasks of past days (done or missed) + anything completed.
  // Filter by the session user explicitly: RLS alone would let an admin see everyone's tasks.
  const [{ data: rows, error }, { data: older }] = await Promise.all([
    supabase
      .from("tasks")
      .select(TODAY_TASK_COLUMNS)
      .eq("assignee_id", me.id)
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
      .eq("assignee_id", me.id)
      .or(`and(type.eq.FIXED,task_date.lt.${from}),and(type.eq.ADHOC,completed_at.lt.${rangeStart})`)
      .limit(1),
  ]);
  if (error) throw new Error("Không tải được lịch sử công việc");

  const days = groupByDay(rows, today);
  const all = days.flatMap((d) => d.tasks);
  const done = all.filter((t) => t.completed).length;
  const missed = all.length - done;

  const newerHref = to < today ? (addDays(to, WINDOW_DAYS) >= today ? "/tasks" : `/tasks?before=${addDays(to, WINDOW_DAYS + 1)}`) : null;
  const olderHref = older?.length ? `/tasks?before=${from}` : null;

  return (
    <>
      <PageHeader title="Công việc" description="Lịch sử công việc của bạn." />

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
        <HistoryView days={days} />
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
