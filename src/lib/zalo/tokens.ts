import "server-only";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import type { ZaloConfig } from "./config";
import { ZaloError } from "./errors";

/**
 * OA tokens. The access token lives about a day; the refresh token is single-use:
 * every refresh returns a new pair, so the pair must be persisted (Supabase Vault,
 * via service-role RPCs) — an env var cannot hold it.
 */
const storedSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.iso.datetime({ offset: true }),
});
type StoredTokens = z.infer<typeof storedSchema>;

/** Zalo answers 200 with either the tokens or { error, error_name, error_description }. */
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.coerce.number().positive(),
});

/** Refresh this long before expiry so a token never dies mid-request. */
const REFRESH_MARGIN_MS = 5 * 60_000;
const TIMEOUT_MS = 10_000;

export async function loadTokens(): Promise<StoredTokens | null> {
  const { data, error } = await createServiceClient().rpc("zalo_get_tokens");
  if (error) throw new ZaloError("NETWORK", "không đọc được token đã lưu");
  const parsed = storedSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function saveTokens(tokens: z.infer<typeof tokenResponseSchema>): Promise<StoredTokens> {
  const stored: StoredTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  };
  const { error } = await createServiceClient().rpc("zalo_save_tokens", {
    p_access_token: stored.access_token,
    p_refresh_token: stored.refresh_token,
    p_expires_at: stored.expires_at,
  });
  if (error) throw new ZaloError("NETWORK", "không lưu được token mới");
  return stored;
}

async function requestTokens(config: ZaloConfig, fields: Record<string, string>) {
  let body: unknown;
  try {
    const response = await fetch(`${config.oauthBaseUrl}/v4/oa/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", secret_key: config.appSecret },
      body: new URLSearchParams({ app_id: config.appId, ...fields }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    body = await response.json();
  } catch (error) {
    throw new ZaloError("NETWORK", error instanceof Error ? error.message : undefined);
  }

  const parsed = tokenResponseSchema.safeParse(body);
  if (parsed.success) return parsed.data;

  // The grant was refused (bad/expired/reused code or refresh token): only reconnecting fixes it.
  const failure = z.object({ error: z.coerce.number().optional(), error_description: z.string().optional(), error_name: z.string().optional() }).safeParse(body);
  const detail = failure.success ? (failure.data.error_description ?? failure.data.error_name) : undefined;
  throw new ZaloError("NOT_CONNECTED", detail, failure.success ? (failure.data.error ?? null) : null);
}

/** OAuth step 2: trade the authorization code for the first token pair and store it. */
export async function exchangeCode(config: ZaloConfig, code: string, codeVerifier: string) {
  const tokens = await requestTokens(config, { grant_type: "authorization_code", code, code_verifier: codeVerifier });
  await saveTokens(tokens);
}

async function refresh(config: ZaloConfig, current: StoredTokens): Promise<StoredTokens> {
  try {
    return await saveTokens(await requestTokens(config, { grant_type: "refresh_token", refresh_token: current.refresh_token }));
  } catch (error) {
    // The refresh token is single-use. If another request refreshed at the same moment, ours is
    // rejected — but the winner has already stored a fresh pair, so use that instead of failing.
    if (error instanceof ZaloError && error.kind === "NOT_CONNECTED") {
      const latest = await loadTokens();
      if (latest && latest.refresh_token !== current.refresh_token) return latest;
    }
    throw error;
  }
}

/** A usable OA access token, refreshed when it is (about to be) expired. */
export async function getAccessToken(config: ZaloConfig, { forceRefresh = false } = {}): Promise<string> {
  const stored = await loadTokens();
  if (!stored) throw new ZaloError("NOT_CONNECTED");

  const expiring = Date.parse(stored.expires_at) - Date.now() < REFRESH_MARGIN_MS;
  return (forceRefresh || expiring ? await refresh(config, stored) : stored).access_token;
}

export async function clearTokens() {
  const { error } = await createServiceClient().rpc("zalo_clear_tokens");
  if (error) throw new ZaloError("NETWORK", "không xoá được token");
}
