import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const DEFAULT_TEAM_NAME = "Team Todo";

/** Defaults must match private.schedule_notifications() in SQL. */
const SUMMARY_TIME_DEFAULTS = { end_of_day_summary_time: "17:30", admin_daily_summary_time: "18:00" } as const;

/** When the notification scheduler sends the end-of-day summaries (HH:MM, app timezone). */
export async function getSummaryTimes(): Promise<{ endOfDay: string; adminDaily: string }> {
  const supabase = await createClient();
  const { data } = await supabase.from("system_settings").select("key, value").in("key", Object.keys(SUMMARY_TIME_DEFAULTS));
  const read = (key: keyof typeof SUMMARY_TIME_DEFAULTS) => {
    const value = data?.find((row) => row.key === key)?.value;
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : SUMMARY_TIME_DEFAULTS[key];
  };
  return { endOfDay: read("end_of_day_summary_time"), adminDaily: read("admin_daily_summary_time") };
}

/** Team display name from `system_settings` (members read, admins write). Cached per request. */
export const getTeamName = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.from("system_settings").select("value").eq("key", "team_name").maybeSingle();
  return typeof data?.value === "string" && data.value.trim() ? data.value : DEFAULT_TEAM_NAME;
});
