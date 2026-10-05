// End-to-end test of the Zalo OA integration against a fake Zalo (scripts/mock-zalo.mjs).
// Covers: connect the OA (OAuth + PKCE) → enable → a member links via the signed webhook →
// admin test message → the worker drains the queue (incl. token refresh, refused recipient,
// pg_cron waking the worker) → disconnect.
//
// Requires local Supabase with seed data (`npm run db:reset`) and the app running WITH this env:
//   ZALO_APP_ID=mock-app-id  ZALO_APP_SECRET=mock-app-secret  ZALO_OA_SECRET_KEY=mock-oa-secret
//   ZALO_API_BASE_URL=http://localhost:4010  ZALO_OAUTH_BASE_URL=http://localhost:4010
//   APP_URL=http://localhost:3123  CRON_SECRET=local-cron-secret-0123456789
//   npm run build && npm start -- -p 3123      then:  npm run test:zalo
// It changes data (links members, toggles settings) — run `npm run db:reset` afterwards.

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { MOCK, startMockZalo } from "./mock-zalo.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3123";
const CRON_SECRET = process.env.CRON_SECRET ?? "local-cron-secret-0123456789";
/** How the database container reaches the app on the host (for the pg_cron → worker check). */
const BASE_FROM_DB = process.env.E2E_BASE_URL_FROM_DB ?? BASE.replace("localhost", "host.docker.internal");
const SHOTS = process.env.E2E_SCREENSHOTS;
const PASSWORD = "Password123!";
const AN = "00000000-0000-4000-8000-000000000002";
const BINH = "00000000-0000-4000-8000-000000000003";
const AN_ZALO_ID = "zalo-user-an";

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
}

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

/** A webhook call signed exactly like Zalo signs them. */
function webhook(event, { secret = MOCK.oaSecretKey } = {}) {
  const rawBody = JSON.stringify(event);
  const mac = createHash("sha256").update(MOCK.appId + rawBody + event.timestamp + secret, "utf8").digest("hex");
  return fetch(`${BASE}/api/zalo/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ZEvent-Signature": `mac=${mac}` },
    body: rawBody,
  });
}
const textEvent = (senderId, text) => ({
  app_id: MOCK.appId,
  user_id_by_app: `app-${senderId}`,
  event_name: "user_send_text",
  timestamp: String(Date.now()),
  sender: { id: senderId },
  recipient: { id: MOCK.oaId },
  message: { msg_id: `m-${Date.now()}`, text },
});

const dispatch = (secret = CRON_SECRET) =>
  fetch(`${BASE}/api/cron/zalo-dispatch`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });

async function queue(userId, title) {
  const { data, error } = await service
    .from("notification_logs")
    .insert({ user_id: userId, type: "NEW_TASK", provider: "ZALO", dedupe_key: `test-zalo:${title}:${Date.now()}`, payload: { title, body: "Nội dung thử", url: "/today" } })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
const row = async (id) => (await service.from("notification_logs").select("status, retry_count, error, external_message_id").eq("id", id).single()).data;

const mock = await startMockZalo();
const browser = await chromium.launch({ channel: "msedge" });
try {
  const viewport = { width: 390, height: 844 };
  const adminPage = await (await browser.newContext({ viewport, deviceScaleFactor: 2 })).newPage();
  const anPage = await (await browser.newContext({ viewport, deviceScaleFactor: 2 })).newPage();

  // ---------- admin: status before connecting ----------
  await login(adminPage, "admin@team.local");
  await adminPage.goto(`${BASE}/settings`);
  await adminPage.getByRole("link", { name: /Zalo OA/ }).click();
  await adminPage.waitForURL("**/settings/zalo");
  check("admin reaches Cài đặt → Thông báo → Zalo OA", true);
  check("status: server configured, OA not connected", (await adminPage.getByText("Đủ biến môi trường").isVisible()) && (await adminPage.getByText("Chưa kết nối", { exact: true }).isVisible()));
  check("the enable switch is locked until the OA is connected", await adminPage.getByRole("switch", { name: "Gửi thông báo qua Zalo" }).isDisabled());
  if (SHOTS) await adminPage.screenshot({ path: `${SHOTS}/zalo-admin-before.png`, fullPage: true });

  // ---------- member: channel not available yet ----------
  await login(anPage, "an@team.local");
  await anPage.goto(`${BASE}/profile`);
  check("member sees Zalo as not available while the team has not switched it on", await anPage.getByText("Team chưa bật Zalo").isVisible());

  // ---------- connect the OA (OAuth + PKCE through the fake Zalo) ----------
  await adminPage.getByRole("link", { name: "Kết nối Zalo OA" }).click();
  await adminPage.waitForURL(/settings\/zalo\?connected=1/);
  check("OAuth round trip connects the OA and shows its name", await adminPage.getByText(MOCK.oaName).isVisible());
  const { data: tokens } = await service.rpc("zalo_get_tokens");
  check("tokens are stored server-side (Vault)", !!tokens?.access_token && !!tokens.refresh_token, Object.keys(tokens ?? {}));
  const html = await adminPage.content();
  check("no secret or token reaches the browser", ![MOCK.appSecret, MOCK.oaSecretKey, CRON_SECRET, tokens?.access_token, tokens?.refresh_token].some((s) => s && html.includes(s)));
  check("the page shows the URLs to register at Zalo", html.includes(`${BASE}/api/zalo/webhook`) && html.includes(`${BASE}/api/zalo/oauth/callback`));

  // A forged callback (wrong state) must not replace the tokens.
  await adminPage.goto(`${BASE}/api/zalo/oauth/callback?code=forged&state=forged`);
  await adminPage.waitForURL(/settings\/zalo\?error=state/);
  const { data: tokensAfter } = await service.rpc("zalo_get_tokens");
  check("a callback with the wrong state is rejected", tokensAfter?.refresh_token === tokens?.refresh_token);

  // ---------- enable ----------
  await adminPage.goto(`${BASE}/settings/zalo`);
  await adminPage.getByRole("switch", { name: "Gửi thông báo qua Zalo" }).click();
  await adminPage.getByText("Đã bật gửi qua Zalo").waitFor();
  check("admin enables the channel", true);

  // ---------- member links their Zalo by sending a code to the OA ----------
  await anPage.reload();
  await anPage.getByRole("button", { name: "Kết nối Zalo" }).click();
  const codeBox = anPage.getByLabel("Mã kết nối Zalo");
  await codeBox.waitFor();
  const code = (await codeBox.textContent()).trim();
  check("member gets a one-time link code", /^[A-HJ-KM-NP-Z2-9]{8}$/.test(code), code);
  if (SHOTS) await anPage.screenshot({ path: `${SHOTS}/zalo-member-code.png`, fullPage: true });

  const forged = await webhook(textEvent("attacker", code), { secret: "wrong-secret" });
  const { data: afterForged } = await service.from("profiles").select("zalo_connected").eq("id", AN).single();
  check("webhook with a bad signature is rejected (401) and links nothing", forged.status === 401 && afterForged.zalo_connected === false, forged.status);

  const chatter = await webhook(textEvent("someone-else", "xin chào OA"));
  check("ordinary messages are acknowledged and ignored", chatter.status === 200 && mock.state.sent.length === 0, mock.state.sent);

  const linked = await webhook(textEvent(AN_ZALO_ID, `Mã của mình: ${code.toLowerCase()}`));
  const { data: anProfile } = await service.from("profiles").select("zalo_user_id, zalo_connected").eq("id", AN).single();
  check("a signed message with the code links the sender's Zalo id to the member", linked.status === 200 && anProfile.zalo_user_id === AN_ZALO_ID && anProfile.zalo_connected, anProfile);
  check("the OA confirms in the chat", mock.state.sent.at(-1)?.userId === AN_ZALO_ID && mock.state.sent.at(-1).text.startsWith("Đã kết nối Zalo"), mock.state.sent.at(-1));

  await anPage.getByText("Đã kết nối", { exact: true }).waitFor({ timeout: 10_000 });
  check("the member's screen updates by itself once linked", true);
  if (SHOTS) await anPage.screenshot({ path: `${SHOTS}/zalo-member-linked.png`, fullPage: true });

  const reuse = await webhook(textEvent("zalo-user-thief", code));
  const { data: stillAn } = await service.from("profiles").select("zalo_user_id").eq("id", AN).single();
  check("a used code cannot link a second Zalo account", reuse.status === 200 && stillAn.zalo_user_id === AN_ZALO_ID);

  // ---------- Definition of Done: test message to a member's own Zalo ----------
  await adminPage.reload();
  await adminPage.getByLabel("Gửi tới").selectOption({ label: "Nguyễn Văn An" });
  const sentBefore = mock.state.sent.length;
  await adminPage.getByRole("button", { name: "Gửi tin thử" }).click();
  await adminPage.getByText("Đã gửi tin thử tới Zalo của Nguyễn Văn An").waitFor();
  const testMessage = mock.state.sent.at(-1);
  check(
    "test message reaches exactly that member's Zalo",
    mock.state.sent.length === sentBefore + 1 && testMessage.userId === AN_ZALO_ID && testMessage.text.includes("Tin nhắn thử") && testMessage.text.includes("Nguyễn Văn An"),
    testMessage,
  );
  check("messages link back to the app", testMessage.text.includes(`${BASE}/today`), testMessage.text);
  await adminPage.reload();
  const history = (await adminPage.getByText("Lịch sử gửi").locator("xpath=ancestor::*[@data-slot='card']").textContent()) ?? "";
  check("the test message is in the notification history", history.includes("Tin nhắn thử") && history.includes("Đã gửi") && history.includes("Nguyễn Văn An"), history);
  if (SHOTS) await adminPage.screenshot({ path: `${SHOTS}/zalo-admin-connected.png`, fullPage: true });

  // ---------- the worker: queue → Zalo ----------
  const first = await queue(AN, "Sắp đến hạn");
  check("the worker endpoint refuses callers without the secret", (await dispatch("not-the-secret")).status === 401);
  const firstRun = await (await dispatch()).json();
  const firstRow = await row(first);
  check("worker delivers a queued notification and stores Zalo's message id", firstRun.sent === 1 && firstRow.status === "SENT" && firstRow.external_message_id === mock.state.sent.at(-1).messageId, [firstRun, firstRow]);

  // Access token rejected mid-flight → refresh once and retry, transparently.
  await fetch(`http://localhost:${MOCK.port}/__expire-access`);
  const second = await queue(AN, "Token hết hạn");
  const refreshesBefore = mock.state.refreshes;
  const secondRun = await (await dispatch()).json();
  check("an expired access token is refreshed and the message still goes out", secondRun.sent === 1 && mock.state.refreshes === refreshesBefore + 1 && (await row(second)).status === "SENT", secondRun);
  const { data: rotated } = await service.rpc("zalo_get_tokens");
  check("the rotated token pair is persisted", rotated.refresh_token !== tokens.refresh_token);

  // A recipient Zalo refuses → normalised error, final (no pointless retries).
  await service.from("profiles").update({ zalo_user_id: MOCK.blockedUserId, zalo_connected: true }).eq("id", BINH);
  const refused = await queue(BINH, "Bị từ chối");
  const refusedRun = await (await dispatch()).json();
  const refusedRow = await row(refused);
  check(
    "a refused recipient fails once with Zalo's reason and code",
    refusedRun.failed === 1 && refusedRow.status === "FAILED" && refusedRow.retry_count === 1 && refusedRow.error.includes("-230"),
    [refusedRun, refusedRow],
  );

  // The real trigger: pg_cron notices due ZALO rows and wakes the worker through pg_net.
  await service.rpc("zalo_configure_dispatch", { p_url: `${BASE_FROM_DB}/api/cron/zalo-dispatch`, p_secret: CRON_SECRET });
  const cronRow = await queue(AN, "Qua pg_cron");
  let cronStatus;
  for (let i = 0; i < 18 && cronStatus !== "SENT"; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    cronStatus = (await row(cronRow)).status;
  }
  check("pg_cron wakes the worker by itself within a minute or so", cronStatus === "SENT", cronStatus);

  // ---------- switched off → nothing leaves ----------
  await adminPage.goto(`${BASE}/settings/zalo`);
  await adminPage.getByRole("switch", { name: "Gửi thông báo qua Zalo" }).click();
  await adminPage.getByText("Đã tắt gửi qua Zalo").waitFor();
  const whileOff = await queue(AN, "Khi đang tắt");
  const sentWhenOff = mock.state.sent.length;
  await dispatch();
  const offRow = await row(whileOff);
  check("with the channel off, queued Zalo messages are not sent", mock.state.sent.length === sentWhenOff && offRow.status === "FAILED" && offRow.error === "Zalo OA đang tắt", offRow);

  // ---------- unlink + disconnect ----------
  await anPage.reload();
  await anPage.getByRole("button", { name: "Ngắt kết nối Zalo" }).click();
  await anPage.getByText("Đã ngắt kết nối Zalo").waitFor();
  const { data: unlinked } = await service.from("profiles").select("zalo_user_id, zalo_connected").eq("id", AN).single();
  check("member can unlink their Zalo", unlinked.zalo_user_id === null && unlinked.zalo_connected === false, unlinked);

  await adminPage.reload();
  await adminPage.getByRole("button", { name: "Ngắt kết nối" }).click();
  await adminPage.getByRole("button", { name: "Xác nhận ngắt" }).click();
  await adminPage.getByText("Đã ngắt kết nối Zalo OA").waitFor();
  const { data: gone } = await service.rpc("zalo_get_tokens");
  check("admin can disconnect the OA (tokens removed)", gone === null, gone);
} finally {
  await browser.close();
  await mock.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll Zalo checks passed");
process.exit(failed ? 1 : 0);
