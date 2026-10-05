"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDeadline } from "@/lib/time";
import type { Enums, Json } from "@/types/database";

export type TimelineEntry = {
  id: number;
  action: Enums<"task_action">;
  at: string;
  /** Who did it, relative to the viewer. */
  actor: "me" | "system" | "other";
  /** Name of an "other" actor — null when RLS hides their profile (employees can't read other members). */
  actorName: string | null;
  /** What changed, already worded for the user. */
  detail: string | null;
};

export type TimelineResult = { ok: true; entries: TimelineEntry[] } | { ok: false; error: string };

/** Change log of one task, oldest first. RLS limits it to the viewer's own tasks (admins: all). */
export async function getTaskTimeline(taskId: string): Promise<TimelineResult> {
  const me = await requireUser();
  const id = z.uuid().safeParse(taskId);
  if (!id.success) return { ok: false, error: "Dữ liệu không hợp lệ" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_history")
    .select("id, action, actor_id, old_data, new_data, created_at, actor:profiles(full_name)")
    .eq("task_id", id.data)
    .order("created_at")
    .order("id")
    .limit(100);
  if (error) return { ok: false, error: "Không tải được lịch sử" };

  return {
    ok: true,
    entries: data.map((h) => ({
      id: h.id,
      action: h.action,
      at: h.created_at,
      actor: h.actor_id === null ? "system" : h.actor_id === me.id ? "me" : "other",
      actorName: h.actor?.full_name || null,
      detail: describeChange(h.action, h.old_data, h.new_data),
    })),
  };
}

const FIELD_LABELS: Record<string, string> = {
  title: "tên",
  note: "ghi chú",
  employee_note: "ghi chú",
  deadline_at: "deadline",
};

function field(data: Json | null, key: string): Json | undefined {
  return data !== null && typeof data === "object" && !Array.isArray(data) ? data[key] : undefined;
}

function describeChange(action: Enums<"task_action">, oldData: Json | null, newData: Json | null): string | null {
  if (action === "RESCHEDULED") {
    const from = field(oldData, "deadline_at");
    const to = field(newData, "deadline_at");
    const label = (v: Json | undefined) => (typeof v === "string" ? formatDeadline(v) : "Không deadline");
    return `${label(from)} → ${label(to)}`;
  }
  if (action === "UPDATED" && newData !== null && typeof newData === "object" && !Array.isArray(newData)) {
    const labels = [...new Set(Object.keys(newData).map((k) => FIELD_LABELS[k]).filter((l) => l !== undefined))];
    return labels.length > 0 ? `Sửa ${labels.join(", ")}` : null;
  }
  return null;
}
