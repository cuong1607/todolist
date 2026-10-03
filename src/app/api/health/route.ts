import { checkSupabaseHealth } from "@/lib/supabase/health";

export async function GET() {
  const health = await checkSupabaseHealth();
  return Response.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
