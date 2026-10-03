import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_TIMEZONE, formatDateLong, startOfDayISO, todayLocal } from "@/lib/time";
import { TODAY_TASK_COLUMNS } from "./task-types";
import { TodayView } from "./today-list";

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
    .select(TODAY_TASK_COLUMNS)
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
    <TodayView
      initialTasks={tasks}
      userId={me.id}
      greeting={`${greetingFor(new Date())}, ${givenName(me.full_name || me.email)}`}
      dateLabel={capitalize(formatDateLong(today))}
    />
  );
}

function greetingFor(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIMEZONE, hour: "2-digit", hour12: false }).format(now));
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 13) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

/** Vietnamese names put the given name last: "Nguyễn Văn An" → "An". */
function givenName(fullName: string) {
  const words = fullName.trim().split(/\s+/);
  return words[words.length - 1] ?? fullName;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
