import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Service-role client for server JOBS that have no user session: the notification
 * worker, the Zalo webhook, the OA token store. BYPASSES RLS.
 *
 * Use it only for the service-role-only RPCs (claim/complete/fail_notification,
 * zalo_*) and the minimum reads/writes a job needs. Anything a signed-in user
 * triggers for themselves goes through `@/lib/supabase/server` so RLS applies.
 */
export function createServiceClient() {
  return createClient<Database>(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
