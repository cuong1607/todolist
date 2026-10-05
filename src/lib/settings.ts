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

/** Defaults must match private.schedule_notifications() / schedule_morning_summaries() in SQL. */
const SUMMARY_TIME_DEFAULTS = { morning_summary_time: "08:00", end_of_day_summary_time: "17:30", admin_daily_summary_time: "18:00" } as const;

/** When the notification scheduler sends the daily summaries (HH:MM, app timezone). Team-wide, set by admins. */
export async function getSummaryTimes(): Promise<{ morning: string; endOfDay: string; adminDaily: string }> {
  const supabase = await createClient();
  const { data } = await supabase.from("system_settings").select("key, value").in("key", Object.keys(SUMMARY_TIME_DEFAULTS));
  const read = (key: keyof typeof SUMMARY_TIME_DEFAULTS) => {
    const value = data?.find((row) => row.key === key)?.value;
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : SUMMARY_TIME_DEFAULTS[key];
  };
  return { morning: read("morning_summary_time"), endOfDay: read("end_of_day_summary_time"), adminDaily: read("admin_daily_summary_time") };
}

/** Team display name from `system_settings` (members read, admins write). Cached per request. */
export const getTeamName = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.from("system_settings").select("value").eq("key", "team_name").maybeSingle();
  return typeof data?.value === "string" && data.value.trim() ? data.value : DEFAULT_TEAM_NAME;
});
