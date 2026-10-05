import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, startOfDayISO, todayLocal } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TODAY_TASK_COLUMNS } from "../today/task-types";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Lịch" };

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Shift a YYYY-MM month by whole months. */
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const me = await requireUser();
  const currentMonth = todayLocal().slice(0, 7);

  const { month: param } = await searchParams;
  const month = typeof param === "string" && MONTH_PATTERN.test(param) ? param : currentMonth;
  const firstDay = `${month}-01`;
  const nextFirstDay = `${shiftMonth(month, 1)}-01`;
  const lastDay = addDays(nextFirstDay, -1);
  const rangeStart = startOfDayISO(firstDay);
  const rangeEnd = startOfDayISO(nextFirstDay);

  const supabase = await createClient();
  // FIXED on their day; ADHOC on their deadline, or on the day they were done if they had none.
  // Filter by the session user explicitly: RLS alone would let an admin see everyone's tasks.
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select(TODAY_TASK_COLUMNS)
    .eq("assignee_id", me.id)
    .or(
      [
        `and(type.eq.FIXED,task_date.gte.${firstDay},task_date.lte.${lastDay})`,
        `and(type.eq.ADHOC,deadline_at.gte.${rangeStart},deadline_at.lt.${rangeEnd})`,
        `and(type.eq.ADHOC,deadline_at.is.null,completed_at.gte.${rangeStart},completed_at.lt.${rangeEnd})`,
      ].join(","),
    );
  if (error) throw new Error("Không tải được lịch");

  const [year, monthNumber] = month.split("-").map(Number);

  return (
    <>
      <PageHeader title="Lịch" description="Xem công việc theo ngày." />

      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-title">
          Tháng {monthNumber}, {year}
        </h3>
        <div className="flex items-center gap-1">
          {month !== currentMonth && (
            <Link href="/calendar" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-11 px-3")}>
              Tháng này
            </Link>
          )}
          <Link
            href={`/calendar?month=${shiftMonth(month, -1)}`}
            aria-label="Tháng trước"
            className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }), "size-11")}
          >
            <ChevronLeft />
          </Link>
          <Link
            href={`/calendar?month=${shiftMonth(month, 1)}`}
            aria-label="Tháng sau"
            className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }), "size-11")}
          >
            <ChevronRight />
          </Link>
        </div>
      </div>

      {/* key: a new month starts with a fresh selected day */}
      <CalendarView key={month} firstDay={firstDay} daysInMonth={Number(lastDay.slice(8))} tasks={tasks} />
    </>
  );
}
