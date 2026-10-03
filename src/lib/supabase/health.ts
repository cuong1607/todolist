import "server-only";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "./server";

const healthSchema = z.object({
  ok: z.literal(true),
  schema_version: z.string(),
  server_time: z.string(),
});

export type SupabaseHealth =
  | { status: "not_configured" }
  | { status: "ok"; schemaVersion: string; serverTime: string; latencyMs: number }
  | { status: "error"; message: string };

/** Calls the `app_health()` RPC from the foundation migration. */
export async function checkSupabaseHealth(): Promise<SupabaseHealth> {
  if (!isSupabaseConfigured()) return { status: "not_configured" };

  const started = performance.now();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("app_health");
    if (error) return { status: "error", message: error.message };

    const parsed = healthSchema.safeParse(data);
    if (!parsed.success) return { status: "error", message: "Phản hồi app_health() không hợp lệ" };

    return {
      status: "ok",
      schemaVersion: parsed.data.schema_version,
      serverTime: parsed.data.server_time,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
