import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const DEFAULT_TEAM_NAME = "Team Todo";

/** What any member may know about the team's Zalo channel (no secrets live in system_settings). */
export async function getZaloChannel(): Promise<{ enabled: boolean; oaId: string | null; oaName: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.from("system_settings").select("key, value").in("key", ["zalo_enabled", "zalo_oa_id", "zalo_oa_name"]);
  const text = (key: string) => {
    const value = data?.find((row) => row.key === key)?.value;
    return typeof value === "string" && value ? value : null;
  };
  return { enabled: data?.find((row) => row.key === "zalo_enabled")?.value === true, oaId: text("zalo_oa_id"), oaName: text("zalo_oa_name") };
}

export type NotificationSchedule = {
  /** IANA zone every time below is in. Fixed for the app (see `APP_TIMEZONE`), not an editable setting. */
  timezone: string;
  /** HH:MM */
  morning: string;
  endOfDay: string;
  adminDaily: string;
  adminDailyEnabled: boolean;
  /** Minutes before a timed ad-hoc deadline; 0 = off. */
  deadlineReminder: number;
};

/**
 * The team's notification schedule, set by admins. Read from the `notification_schedule()` RPC —
 * the same function the SQL schedulers read — so the defaults live in one place (SQL), not here.
 */
export const getNotificationSchedule = cache(async (): Promise<NotificationSchedule> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("notification_schedule").single();
  if (error) throw new Error(`notification_schedule(): ${error.message}`);
  return {
    timezone: data.timezone,
    morning: data.morning_summary_time,
    endOfDay: data.end_of_day_summary_time,
    adminDaily: data.admin_daily_summary_time,
    adminDailyEnabled: data.admin_daily_summary_enabled,
    deadlineReminder: data.deadline_reminder_minutes,
  };
});

/** Team display name from `system_settings` (members read, admins write). Cached per request. */
export const getTeamName = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.from("system_settings").select("value").eq("key", "team_name").maybeSingle();
  return typeof data?.value === "string" && data.value.trim() ? data.value : DEFAULT_TEAM_NAME;
});
