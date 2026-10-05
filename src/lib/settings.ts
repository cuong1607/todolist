import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const DEFAULT_TEAM_NAME = "Team Todo";

/** Team display name from `system_settings` (members read, admins write). Cached per request. */
export const getTeamName = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.from("system_settings").select("value").eq("key", "team_name").maybeSingle();
  return typeof data?.value === "string" && data.value.trim() ? data.value : DEFAULT_TEAM_NAME;
});
