import { timingSafeEqual } from "node:crypto";
import { getZaloConfig } from "@/lib/zalo/config";
import { dispatchZaloNotifications } from "@/lib/zalo/dispatch";

export const dynamic = "force-dynamic";
/** Sending a batch one by one can take a while when Zalo is slow. */
export const maxDuration = 60;

function authorized(request: Request, secret: string) {
  const presented = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/**
 * The Zalo worker's entry point. pg_cron calls it (via pg_net) whenever ZALO
 * notifications are due, presenting CRON_SECRET. No user session is involved.
 */
export async function POST(request: Request) {
  const config = getZaloConfig();
  if (!config) return Response.json({ error: "zalo_not_configured" }, { status: 503 });
  if (!authorized(request, config.cronSecret)) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    return Response.json(await dispatchZaloNotifications(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("zalo dispatch failed", error);
    return Response.json({ error: "dispatch_failed" }, { status: 500 });
  }
}
