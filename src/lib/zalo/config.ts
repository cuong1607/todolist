import "server-only";
import { z } from "zod";

/**
 * Zalo credentials come from the server environment only. Nothing here is ever
 * sent to the browser (no NEXT_PUBLIC_ prefix, and this module is server-only).
 */
const zaloEnvSchema = z.object({
  /** Zalo app id (developers.zalo.me → app → Settings). */
  ZALO_APP_ID: z.string().min(1),
  /** App secret key: authenticates token exchange/refresh. */
  ZALO_APP_SECRET: z.string().min(1),
  /** "OA Secret Key" from the app's Webhook page: verifies webhook signatures. */
  ZALO_OA_SECRET_KEY: z.string().min(1),
  /** Public origin of this app, e.g. https://todo.example.com — used for the OAuth callback, webhook and worker URLs. */
  APP_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  /** Shared secret pg_cron presents when it wakes the worker. */
  CRON_SECRET: z.string().min(16),
});

const REQUIRED = Object.keys(zaloEnvSchema.shape) as (keyof z.infer<typeof zaloEnvSchema>)[];

export type ZaloConfig = {
  appId: string;
  appSecret: string;
  oaSecretKey: string;
  appUrl: string;
  cronSecret: string;
  /** Overridable so tests can point the provider at a local fake. */
  apiBaseUrl: string;
  oauthBaseUrl: string;
};

function readEnv() {
  return Object.fromEntries(REQUIRED.map((key) => [key, process.env[key]]));
}

/** Names of the env vars that are missing or malformed — shown to the admin, values never are. */
export function missingZaloEnv(): string[] {
  const parsed = zaloEnvSchema.safeParse(readEnv());
  return parsed.success ? [] : [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
}

/** The Zalo configuration, or null when the server is not set up for Zalo yet. */
export function getZaloConfig(): ZaloConfig | null {
  const parsed = zaloEnvSchema.safeParse(readEnv());
  if (!parsed.success) return null;
  const env = parsed.data;
  return {
    appId: env.ZALO_APP_ID,
    appSecret: env.ZALO_APP_SECRET,
    oaSecretKey: env.ZALO_OA_SECRET_KEY,
    appUrl: env.APP_URL,
    cronSecret: env.CRON_SECRET,
    apiBaseUrl: (process.env.ZALO_API_BASE_URL || "https://openapi.zalo.me").replace(/\/+$/, ""),
    oauthBaseUrl: (process.env.ZALO_OAUTH_BASE_URL || "https://oauth.zaloapp.com").replace(/\/+$/, ""),
  };
}

/** Cookie holding the OAuth state + PKCE verifier between the two legs of the connect flow. */
export const ZALO_OAUTH_COOKIE = { name: "zalo_oauth", path: "/api/zalo/oauth" } as const;

export const zaloPaths = {
  oauthCallback: "/api/zalo/oauth/callback",
  webhook: "/api/zalo/webhook",
  dispatch: "/api/cron/zalo-dispatch",
} as const;
