// End-to-end auth flow in a real browser (installed Microsoft Edge via playwright-core).
// Requires: local Supabase with seed (`npm run db:reset`) and the app running.
//   npm run build && npm start -- -p 3123   (in another terminal)
//   E2E_BASE_URL=http://localhost:3123 npm run test:e2e
// Set E2E_SCREENSHOTS=<dir> to save screenshots.

import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SCREENSHOTS;
const PASSWORD = "Password123!";

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → ${detail ?? ""}`}`);
  if (!ok) failed++;
}
const path = (page) => new URL(page.url()).pathname;

async function login(page, email, password = PASSWORD) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

async function logout(page) {
  await page.goto(`${BASE}/profile`);
  await page.getByRole("button", { name: "Đăng xuất" }).last().click();
  await page.waitForURL("**/login");
}

const browser = await chromium.launch({ channel: "msedge" });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage();

  // ---------- signed out ----------
  await page.goto(`${BASE}/today`);
  check("signed-out visitor is redirected to /login", path(page) === "/login", page.url());
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-login.png` });

  await login(page, "an@team.local", "wrong-password");
  // Scope to the form: Next.js's route announcer also has role="alert".
  const wrongPwText = await page.locator("form [role=alert]").textContent();
  check("wrong password shows an error", wrongPwText?.includes("không đúng"), wrongPwText);

  // ---------- employee ----------
  await login(page, "an@team.local");
  await page.waitForURL("**/today");
  check("employee lands on /today", path(page) === "/today", page.url());

  const nav = page.getByRole("navigation", { name: "Điều hướng chính" }).last();
  check("employee nav has 'Hồ sơ'", await nav.getByText("Hồ sơ").isVisible());
  check("employee nav hides 'Thành viên'", (await nav.getByText("Thành viên").count()) === 0);

  await page.reload();
  check("session survives reload", path(page) === "/today", page.url());

  // ---------- employee: today's fixed tasks ----------
  const progress = page.getByRole("progressbar", { name: "Tiến độ hôm nay" });
  await progress.waitFor();
  check("employee sees 3 fixed tasks today", (await page.getByRole("checkbox").count()) === 3);
  check("progress starts at 0/3", (await progress.getAttribute("aria-valuenow")) === "0");

  await page.getByRole("checkbox", { name: "Hoàn thành “Kiểm tra đơn hàng mới”" }).click();
  await page.getByRole("checkbox", { name: "Mở lại “Kiểm tra đơn hàng mới”" }).waitFor();
  await page.waitForTimeout(800);
  await page.reload();
  await progress.waitFor();
  check("completion persists after reload", (await progress.getAttribute("aria-valuenow")) === "1");
  await page.waitForTimeout(600);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-employee-today.png`, fullPage: true });

  await page.getByRole("checkbox", { name: "Mở lại “Kiểm tra đơn hàng mới”" }).click();
  await page.getByRole("checkbox", { name: "Hoàn thành “Kiểm tra đơn hàng mới”" }).waitFor();
  await page.waitForTimeout(800);
  await page.reload();
  await progress.waitFor();
  check("employee can reopen a task", (await progress.getAttribute("aria-valuenow")) === "0");

  // Only "Báo cáo tồn kho cuối ngày" allows notes in the seed.
  check("only tasks that allow notes show a note box", (await page.getByText("Thêm ghi chú…").count()) === 1);
  await page.getByText("Thêm ghi chú…").click();
  await page.getByLabel("Ghi chú").fill("Tồn kho: 42");
  await page.getByRole("button", { name: "Lưu ghi chú" }).click();
  await page.getByText("Đã lưu ghi chú").waitFor();
  await page.reload();
  check("employee note persists", await page.getByText("Tồn kho: 42").isVisible());

  for (const adminPath of ["/members", "/overview", "/settings", "/fixed-tasks"]) {
    await page.goto(`${BASE}${adminPath}`);
    check(`employee blocked from ${adminPath}`, path(page) === "/today", page.url());
  }

  await page.goto(`${BASE}/profile`);
  await page.getByLabel("Họ tên").fill("Nguyễn Văn An");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await page.getByText("Đã lưu hồ sơ").waitFor();
  check("employee can save own profile", true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-employee-profile.png`, fullPage: true });

  await logout(page);
  await page.goto(`${BASE}/today`);
  check("after logout, app pages redirect to /login", path(page) === "/login", page.url());

  // ---------- admin ----------
  await login(page, "admin@team.local");
  await page.waitForURL("**/overview");
  check("admin lands on /overview", path(page) === "/overview", page.url());

  await page.goto(`${BASE}/members`);
  const rows = page.getByRole("listitem");
  await rows.first().waitFor();
  check("admin sees all members", (await rows.count()) >= 3, `${await rows.count()} rows`);
  await page.waitForTimeout(600);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-admin-members.png`, fullPage: true });

  // Create a member, then deactivate them and confirm they cannot sign in.
  const email = `e2e-${Date.now()}@team.local`;
  await page.getByRole("button", { name: "Thêm thành viên" }).first().click();
  await page.getByLabel("Họ tên").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu tạm").fill("TempPass123");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-admin-create.png` });
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await page.getByText(email).waitFor();
  check("admin can create a member", true);

  const row = page.getByRole("listitem").filter({ hasText: email });
  await row.getByRole("switch").click();
  await page.getByText("Đã khoá E2E Tester").waitFor();
  check("admin can deactivate a member", true);

  // ---------- admin: fixed task templates ----------
  await page.goto(`${BASE}/fixed-tasks`);
  await page.getByRole("link", { name: /Trần Thị Bình/ }).click();
  await page.waitForURL(/member=/);
  await page.getByText("Trả lời tin nhắn khách hàng").waitFor();
  await page.waitForTimeout(600);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-admin-fixed.png`, fullPage: true });

  await page.getByRole("button", { name: "Thêm việc cố định" }).last().click();
  await page.getByLabel("Tên công việc").fill("E2E việc cố định");
  await page.getByRole("button", { name: "Hằng ngày" }).click();
  await page.getByLabel("Hạn trong ngày").fill("23:59");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-admin-fixed-dialog.png` });
  await page.getByRole("button", { name: "Thêm việc", exact: true }).click();
  await page.getByText("Đã lưu việc cố định").waitFor();
  check("admin can create a fixed task template", await page.getByText("E2E việc cố định").isVisible());

  await page.getByText("E2E việc cố định").click(); // tapping the title opens the editor
  await page.getByRole("dialog").waitFor();
  check("template with history offers no hard delete", (await page.getByRole("dialog").getByRole("button", { name: "Xoá" }).count()) === 0);
  await page.keyboard.press("Escape");

  await logout(page);
  await login(page, "binh@team.local");
  await page.waitForURL("**/today");
  check("new template appears in the employee's today list immediately", await page.getByText("E2E việc cố định").isVisible());

  await logout(page);
  await login(page, "admin@team.local");
  await page.waitForURL("**/overview");
  await page.goto(`${BASE}/fixed-tasks`);
  await page.getByRole("link", { name: /Trần Thị Bình/ }).click();
  await page.getByRole("switch", { name: "Tắt “E2E việc cố định”" }).click();
  await page.getByText("Lịch sử vẫn được giữ").waitFor();
  check("admin can disable a template", true);

  await logout(page);
  await login(page, "binh@team.local");
  await page.waitForURL("**/today");
  check("disabling keeps today's already-generated task (history)", await page.getByText("E2E việc cố định").isVisible());

  await logout(page);
  await login(page, email, "TempPass123");
  const bannedText = await page.locator("form [role=alert]").textContent();
  check("deactivated member cannot sign in", bannedText?.includes("khoá") && path(page) === "/login", bannedText);

  // ---------- desktop layout ----------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dpage = await desktop.newPage();
  await login(dpage, "admin@team.local");
  await dpage.waitForURL("**/overview");
  await dpage.goto(`${BASE}/members`);
  await dpage.getByRole("listitem").first().waitFor();
  await dpage.waitForTimeout(600);
  check("desktop shows sidebar", await dpage.locator("aside").isVisible());
  if (SHOTS) await dpage.screenshot({ path: `${SHOTS}/e2e-admin-members-desktop.png` });
  await dpage.goto(`${BASE}/fixed-tasks`);
  await dpage.getByText("Kiểm tra đơn hàng mới").waitFor();
  await dpage.waitForTimeout(600);
  if (SHOTS) await dpage.screenshot({ path: `${SHOTS}/e2e-admin-fixed-desktop.png` });
} finally {
  await browser.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll e2e checks passed");
process.exit(failed ? 1 : 0);
