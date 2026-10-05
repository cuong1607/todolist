// A fake Zalo, just enough to exercise the provider end to end without a real OA.
// It mimics the endpoints the app calls (same paths, headers and response envelopes):
//   GET  /v4/oa/permission      OAuth consent → redirects back with ?code&oa_id&state
//   POST /v4/oa/access_token    authorization_code (PKCE) and single-use refresh_token grants
//   POST /v3.0/oa/message/cs    send a text message
//   GET  /v2.0/oa/getoa         OA profile
// Plus /__state and /__expire-access for the test to inspect and poke it.
//
// Used by scripts/test-zalo.mjs (which starts it in-process). Point the app at it with
// ZALO_API_BASE_URL / ZALO_OAUTH_BASE_URL = http://localhost:4010.

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

export const MOCK = {
  port: 4010,
  appId: "mock-app-id",
  appSecret: "mock-app-secret",
  oaSecretKey: "mock-oa-secret",
  oaId: "4000000000000000001",
  oaName: "Team Todo OA (mock)",
  /** A recipient Zalo refuses, like a follower outside the interaction window. */
  blockedUserId: "blocked-user",
};

export function startMockZalo() {
  const state = {
    /** code → PKCE challenge it was issued for */
    codes: new Map(),
    accessToken: null,
    refreshToken: null,
    refreshes: 0,
    sent: [],
  };

  const issueTokens = () => {
    state.accessToken = `access-${randomBytes(8).toString("hex")}`;
    state.refreshToken = `refresh-${randomBytes(8).toString("hex")}`;
    // Zalo returns expires_in as a string.
    return { access_token: state.accessToken, refresh_token: state.refreshToken, expires_in: "3600" };
  };

  const readBody = (req) =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
    });

  const json = (res, body, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${MOCK.port}`);

    if (req.method === "GET" && url.pathname === "/v4/oa/permission") {
      const code = `code-${randomBytes(6).toString("hex")}`;
      state.codes.set(code, url.searchParams.get("code_challenge"));
      const back = new URL(url.searchParams.get("redirect_uri"));
      back.searchParams.set("code", code);
      back.searchParams.set("oa_id", MOCK.oaId);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }

    if (req.method === "POST" && url.pathname === "/v4/oa/access_token") {
      const form = new URLSearchParams(await readBody(req));
      if (req.headers["secret_key"] !== MOCK.appSecret || form.get("app_id") !== MOCK.appId) {
        return json(res, { error: -14002, error_name: "invalid_client", error_description: "Invalid app id or secret key" });
      }
      if (form.get("grant_type") === "authorization_code") {
        const challenge = state.codes.get(form.get("code"));
        const verifier = form.get("code_verifier") ?? "";
        const ok = challenge !== undefined && createHash("sha256").update(verifier).digest("base64url") === challenge;
        state.codes.delete(form.get("code"));
        return ok ? json(res, issueTokens()) : json(res, { error: -14003, error_name: "invalid_grant", error_description: "Invalid authorization code" });
      }
      if (form.get("grant_type") === "refresh_token") {
        // Single use: only the latest refresh token works, and using it rotates both tokens.
        if (form.get("refresh_token") !== state.refreshToken) {
          return json(res, { error: -14014, error_name: "invalid_grant", error_description: "Invalid refresh token" });
        }
        state.refreshes++;
        return json(res, issueTokens());
      }
      return json(res, { error: -14001, error_name: "unsupported_grant_type" });
    }

    if (url.pathname === "/v3.0/oa/message/cs" || url.pathname === "/v2.0/oa/getoa") {
      if (!state.accessToken || req.headers["access_token"] !== state.accessToken) {
        return json(res, { error: -216, message: "Access token is invalid" });
      }
      if (url.pathname === "/v2.0/oa/getoa") {
        return json(res, { error: 0, message: "Success", data: { oa_id: MOCK.oaId, name: MOCK.oaName } });
      }
      const body = JSON.parse(await readBody(req));
      const userId = body?.recipient?.user_id;
      if (userId === MOCK.blockedUserId) {
        return json(res, { error: -230, message: "User has not interacted with the OA in the last 7 days" });
      }
      const messageId = `mock-msg-${state.sent.length + 1}`;
      state.sent.push({ userId, text: body?.message?.text, messageId });
      return json(res, { error: 0, message: "Success", data: { message_id: messageId, user_id: userId } });
    }

    if (url.pathname === "/__state") return json(res, { sent: state.sent, refreshes: state.refreshes, connected: !!state.accessToken });
    if (url.pathname === "/__expire-access") {
      state.accessToken = `expired-${randomBytes(4).toString("hex")}`;
      return json(res, { ok: true });
    }

    json(res, { error: -1, message: `mock-zalo: no route for ${req.method} ${url.pathname}` }, 404);
  });

  return new Promise((resolve) => server.listen(MOCK.port, () => resolve({ state, close: () => new Promise((done) => server.close(done)) })));
}

// `node scripts/mock-zalo.mjs` runs it standalone, for clicking through the app by hand.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/mock-zalo.mjs")) {
  await startMockZalo();
  console.log(`mock Zalo listening on http://localhost:${MOCK.port}`);
}
