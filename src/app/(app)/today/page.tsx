import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateLong, startOfDayISO, todayLocal } from "@/lib/time";
import { TodayList } from "./today-list";

export const metadata: Metadata = { title: "Hôm nay" };

export default async function TodayPage() {
  const me = await requireUser();
  const today = todayLocal();
  const supabase = await createClient();

  // Today's FIXED tasks + every unfinished ADHOC task (they carry over across days)
  // + ADHOC tasks finished today. Filter by the session user explicitly: RLS alone
  // would let an admin see everyone's tasks.
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select(
      "id, type, title, note, allow_employee_note, employee_note, deadline_at, completed, completed_at, task_date, sort_order, created_at",
    )
    .eq("assignee_id", me.id)
    .or(
      [
        `and(type.eq.FIXED,task_date.eq.${today})`,
        "and(type.eq.ADHOC,completed.is.false)",
        `and(type.eq.ADHOC,completed_at.gte.${startOfDayISO(today)})`,
      ].join(","),
    )
    .order("sort_order")
    .order("created_at");

  if (error) throw new Error("Không tải được công việc hôm nay");

  return (
    <>
      <PageHeader title="Hôm nay" description={capitalize(formatDateLong(today))} />
      <TodayList tasks={tasks} />
    </>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
