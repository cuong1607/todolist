import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ZALO_OAUTH_COOKIE, getZaloConfig, zaloPaths } from "@/lib/zalo/config";

export const dynamic = "force-dynamic";

/**
 * Step 1 of connecting the OA: send the admin to Zalo to grant this app permission.
 * Zalo sends them back to /api/zalo/oauth/callback with a one-time code.
 */
export async function GET() {
  await requireAdmin();
  const config = getZaloConfig();
  if (!config) redirect("/settings/zalo?error=not_configured");

  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  (await cookies()).set(ZALO_OAUTH_COOKIE.name, JSON.stringify({ state, verifier }), {
    httpOnly: true,
    secure: config.appUrl.startsWith("https://"),
    sameSite: "lax",
    maxAge: 600,
    path: ZALO_OAUTH_COOKIE.path,
  });

  const params = new URLSearchParams({
    app_id: config.appId,
    redirect_uri: `${config.appUrl}${zaloPaths.oauthCallback}`,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  redirect(`${config.oauthBaseUrl}/v4/oa/permission?${params}`);
}
