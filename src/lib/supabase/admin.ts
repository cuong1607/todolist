import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Privileged client — BYPASSES RLS. Only for Auth admin operations
 * (create user, ban/unban). Call only after `requireAdmin()` has passed,
 * and never read/write business data with it.
 */
export function createAdminClient() {
  return createClient<Database>(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
