import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateLong, todayLocal } from "@/lib/time";
import { TodayList } from "./today-list";

export const metadata: Metadata = { title: "Hôm nay" };

export default async function TodayPage() {
  const me = await requireUser();
  const today = todayLocal();
  const supabase = await createClient();

  // Filter by the session user explicitly: RLS would let an admin see everyone's tasks.
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, type, title, note, allow_employee_note, employee_note, due_at, status, completed_at")
    .eq("assignee_id", me.id)
    .eq("task_date", today)
    .order("sort_order")
    .order("created_at");

  if (error) throw new Error("Không tải được công việc hôm nay");

  return (
    <>
      <PageHeader title="Hôm nay" description={capitalize(formatDateLong(today))} />
      {tasks.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck />}
          title="Hôm nay không có việc nào"
          description="Công việc cố định và phát sinh của bạn sẽ hiện ở đây."
        />
      ) : (
        <TodayList tasks={tasks} />
      )}
    </>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
