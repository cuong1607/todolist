import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ZALO_OAUTH_COOKIE, getZaloConfig, zaloPaths } from "@/lib/zalo/config";
import { getOaInfo } from "@/lib/zalo/client";
import { ZaloError } from "@/lib/zalo/errors";
import { exchangeCode } from "@/lib/zalo/tokens";

export const dynamic = "force-dynamic";

const cookieSchema = z.object({ state: z.string().min(1), verifier: z.string().min(1) });

function sameState(a: string, b: string) {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Step 2 of connecting the OA: Zalo returns with ?code&oa_id&state. Trade the code for
 * tokens (stored in Vault), remember which OA this is, and tell the database where the worker lives.
 */
export async function GET(request: NextRequest) {
  await requireAdmin();
  const config = getZaloConfig();
  if (!config) redirect("/settings/zalo?error=not_configured");

  const jar = await cookies();
  let cookieValue: unknown = null;
  try {
    cookieValue = JSON.parse(jar.get(ZALO_OAUTH_COOKIE.name)?.value ?? "null");
  } catch {
    // A mangled cookie is treated like a missing one.
  }
  const saved = cookieSchema.safeParse(cookieValue);
  jar.delete(ZALO_OAUTH_COOKIE);

  const query = request.nextUrl.searchParams;
  const code = query.get("code");
  const state = query.get("state");
  // The state proves this callback belongs to the flow this admin started (CSRF).
  if (!saved.success || !state || !sameState(saved.data.state, state)) redirect("/settings/zalo?error=state");
  if (!code) redirect("/settings/zalo?error=denied");

  try {
    await exchangeCode(config, code, saved.data.verifier);
  } catch (error) {
    console.error("zalo oauth exchange failed", error instanceof ZaloError ? error.message : error);
    redirect("/settings/zalo?error=exchange");
  }

  // Display info only; the connection already works if this fails.
  let oaId = query.get("oa_id");
  let oaName: string | null = null;
  try {
    const info = await getOaInfo(config);
    oaId = info.oaId ?? oaId;
    oaName = info.name;
  } catch (error) {
    console.warn("zalo getoa failed", error instanceof Error ? error.message : error);
  }

  // system_settings is admin-writable under RLS, so this goes through the admin's own session.
  const supabase = await createClient();
  await supabase.from("system_settings").upsert([
    { key: "zalo_oa_id", value: oaId ?? "", description: "ID của Zalo OA đã kết nối" },
    { key: "zalo_oa_name", value: oaName ?? "", description: "Tên Zalo OA đã kết nối" },
  ]);

  // pg_cron needs to know where to wake the worker and which secret to present.
  const { error: dispatchError } = await createServiceClient().rpc("zalo_configure_dispatch", {
    p_url: `${config.appUrl}${zaloPaths.dispatch}`,
    p_secret: config.cronSecret,
  });
  if (dispatchError) console.error("zalo_configure_dispatch failed", dispatchError.message);

  revalidatePath("/settings/zalo");
  redirect("/settings/zalo?connected=1");
}
