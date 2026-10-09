import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** What any member may know about a teammate: id and display name. */
export type TeamMember = { id: string; full_name: string; active: boolean };

/**
 * Everyone on the team, by name. Employees cannot read other profiles, so this goes through the
 * `team_members()` RPC. Pickers must offer only the `active` ones; the rest are there to be named.
 */
export const getTeamMembers = cache(async (): Promise<TeamMember[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_members");
  if (error) throw new Error(`team_members(): ${error.message}`);
  return data;
});
