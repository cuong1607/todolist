// End-to-end auth flow in a real browser (installed Microsoft Edge via playwright-core).
// Requires: local Supabase with seed (`npm run db:reset`) and the app running.
//   npm run build && npm start -- -p 3123   (in another terminal)
//   E2E_BASE_URL=http://localhost:3123 npm run test:e2e
// Set E2E_SCREENSHOTS=<dir> to save screenshots.

import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SCREENSHOTS;
const PASSWORD = "Password123!";
/** Today in the app timezone (must match APP_TIMEZONE). */
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

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
  const navLabels = (await nav.getByRole("link").allTextContents()).map((s) => s.trim()).join(" · ");
  check("employee bottom nav: Hôm nay · Lịch · Công việc · Tài khoản", navLabels === "Hôm nay · Lịch · Công việc · Tài khoản", navLabels);
  check("employee nav hides 'Thành viên'", (await nav.getByText("Thành viên").count()) === 0);

  await page.reload();
  check("session survives reload", path(page) === "/today", page.url());

  // ---------- header: greeting · date · progress ----------
  check("header greets by given name", await page.getByRole("heading", { name: /^Chào buổi .+, An$/ }).isVisible());
  const progress = page.getByRole("progressbar", { name: "Tiến độ hôm nay" });
  await progress.waitFor();
  // Seed: 3 fixed + 1 overdue carried-over ad-hoc + 1 ad-hoc due today (backlog/upcoming excluded).
  check(
    "progress reads '0/5 công việc hoàn thành'",
    (await progress.getAttribute("aria-valuemax")) === "5" && (await page.getByText("công việc hoàn thành").textContent())?.replace(/\s/g, "") === "0/5côngviệchoànthành",
    await page.getByText("công việc hoàn thành").textContent(),
  );

  // ---------- sections in spec order ----------
  const region = (name) => page.getByRole("region", { name });
  // Only our task sections (other regions, e.g. the toast container, have no section- id).
  const shown = (await page.getByRole("region").evaluateAll((els) => els.map((e) => e.getAttribute("aria-labelledby"))))
    .filter((id) => id?.startsWith("section-"))
    .map((id) => id.replace("section-", ""));
  const expectedKeys = ["fixed", "dueToday", "overdue", "backlog", "upcoming"];
  check("sections follow the spec order", JSON.stringify(shown.filter((k) => expectedKeys.includes(k))) === JSON.stringify(expectedKeys.filter((k) => shown.includes(k))), shown);
  check("fixed section lists 3 fixed tasks", (await region(/^Công việc cố định/).getByRole("checkbox").count()) === 3);
  check("carried-over ad-hoc from yesterday is in 'Quá hạn'", await region(/^Quá hạn/).getByText("Gửi báo giá cho khách Hưng Thịnh").isVisible());
  check("no-deadline ad-hoc is in 'Việc đang tồn'", await region(/^Việc đang tồn/).getByText("Tìm nhà cung cấp hộp carton mới").isVisible());
  check("'Sắp tới' starts collapsed", !(await page.getByText("Chuẩn bị hàng mẫu cho buổi chụp ảnh").isVisible()));
  await region(/^Sắp tới/).getByRole("button", { name: /Sắp tới/ }).click();
  await page.getByText("Chuẩn bị hàng mẫu cho buổi chụp ảnh").waitFor();
  check("'Sắp tới' expands on tap", true);
  check("cards show a one-line note preview", await page.getByText("Xác nhận đơn trên hệ thống trước 9h.").isVisible());
  if (SHOTS) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/e2e-employee-today.png`, fullPage: true });
  }

  // ---------- 1-click complete: optimistic, no page reload ----------
  const rscRequests = [];
  const onRequest = (req) => {
    if (req.headers()["rsc"] === "1" || req.resourceType() === "document") rscRequests.push(req.url());
  };
  page.on("request", onRequest);
  const fixedBox = page.getByRole("checkbox", { name: "Hoàn thành “Kiểm tra đơn hàng mới”" });
  const t0 = Date.now();
  await fixedBox.click();
  await page.getByRole("checkbox", { name: "Mở lại “Kiểm tra đơn hàng mới”" }).waitFor();
  const tickMs = Date.now() - t0;
  check("tick is optimistic (checked well before the server answers)", tickMs < 400, `${tickMs}ms`);
  await page.getByText("Đã xong “Kiểm tra đơn hàng mới”").waitFor();
  check("tick does not reload or re-render the page", rscRequests.length === 0, rscRequests);
  page.off("request", onRequest);
  check("progress updates instantly to 1/5", (await progress.getAttribute("aria-valuenow")) === "1");

  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await page.getByRole("checkbox", { name: "Hoàn thành “Kiểm tra đơn hàng mới”" }).waitFor();
  await page.waitForTimeout(800);
  await page.reload();
  await progress.waitFor();
  check("undo from the toast reopens the task (persisted)", (await progress.getAttribute("aria-valuenow")) === "0");

  // ---------- Realtime: a change on another device shows up without reload ----------
  const other = await context.newPage();
  await other.goto(`${BASE}/today`);
  await other.getByRole("checkbox", { name: "Hoàn thành “Đóng gói & bàn giao vận chuyển”" }).waitFor();
  await page.waitForTimeout(1500); // let both Realtime channels finish subscribing
  await other.getByRole("checkbox", { name: "Hoàn thành “Đóng gói & bàn giao vận chuyển”" }).click();
  const synced = await page
    .getByRole("checkbox", { name: "Mở lại “Đóng gói & bàn giao vận chuyển”" })
    .waitFor({ timeout: 8000 })
    .then(() => true, () => false);
  check("Realtime syncs a tick made in another tab", synced);
  await other.getByRole("checkbox", { name: "Mở lại “Đóng gói & bàn giao vận chuyển”" }).click();
  await page.getByRole("checkbox", { name: "Hoàn thành “Đóng gói & bàn giao vận chuyển”" }).waitFor({ timeout: 8000 });
  await other.close();

  // ---------- quick create (extended FAB) → edit → complete ----------
  await page.getByRole("button", { name: "Thêm việc", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên công việc").fill("E2E phát sinh");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-adhoc-create.png` });
  await dialog.getByRole("button", { name: "Thêm việc", exact: true }).click();
  await region(/^Việc đang tồn/).getByText("E2E phát sinh").waitFor();
  check("quick create with only a title lands in 'Việc đang tồn'", true);

  await page.getByRole("button", { name: "Chi tiết “E2E phát sinh”" }).click();
  await dialog.getByRole("radio", { name: "Ngày mai" }).click();
  await dialog.getByLabel("Giờ (tuỳ chọn)").fill("09:30");
  await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
  await region(/^Sắp tới/).getByText("E2E phát sinh").waitFor();
  check("rescheduling to tomorrow moves it to 'Sắp tới'", await region(/^Sắp tới/).getByText("Ngày mai · 09:30").isVisible());

  // Scope to the target section: the old card may still be animating out (150ms) of 'Việc đang tồn'.
  await region(/^Sắp tới/).getByRole("checkbox", { name: "Hoàn thành “E2E phát sinh”" }).click();
  check("completed card stays in place briefly (no jump under the thumb)", await region(/^Sắp tới/).getByText("E2E phát sinh").isVisible());
  await region(/^Đã xong/).waitFor();
  await region(/^Đã xong/).getByRole("button", { name: /Đã xong/ }).click();
  await region(/^Đã xong/).getByText("E2E phát sinh").waitFor();
  check("then it settles into 'Đã xong'", true);
  await page.waitForTimeout(800);
  await page.reload();
  await region(/^Đã xong/).getByRole("button", { name: /Đã xong/ }).click();
  check("completed ad-hoc stays in 'Đã xong' after reload", await region(/^Đã xong/).getByText("E2E phát sinh").isVisible());

  // ---------- fixed task detail: note only where allowed ----------
  await page.getByRole("button", { name: "Chi tiết “Kiểm tra đơn hàng mới”" }).click();
  await dialog.getByText("Hướng dẫn").waitFor();
  check("fixed task without note permission has no note box", (await dialog.getByLabel("Ghi chú của bạn").count()) === 0);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "Chi tiết “Báo cáo tồn kho cuối ngày”" }).click();
  await dialog.getByLabel("Ghi chú của bạn").fill("Tồn kho: 42");
  await dialog.getByRole("button", { name: "Lưu ghi chú" }).click();
  await page.getByText("Đã lưu ghi chú").waitFor();
  await page.keyboard.press("Escape");
  await page.reload();
  check("employee note persists and shows as the card preview", await page.getByText("Tồn kho: 42").isVisible());

  // ---------- history (Công việc) ----------
  await page.goto(`${BASE}/tasks`);
  const historyToday = region(/^Hôm nay/);
  await historyToday.getByText("E2E phát sinh").waitFor();
  check("history lists today's completed ad-hoc under 'Hôm nay'", (await historyToday.getByText("1/1 xong").count()) === 1);
  check("history leaves out today's unfinished fixed tasks", (await page.getByText("Kiểm tra đơn hàng mới").count()) === 0);
  await page.getByRole("button", { name: "Chi tiết “E2E phát sinh”" }).click();
  await dialog.getByText("Bạn hoàn thành").waitFor();
  const timeline = (await dialog.getByRole("listitem").allTextContents()).join(" | ");
  check(
    "task detail shows its change log (created → rescheduled → completed)",
    timeline.includes("Bạn tạo việc") && timeline.includes("Bạn dời deadline") && timeline.includes("Bạn hoàn thành"),
    timeline,
  );
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-history-detail.png` });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-history.png`, fullPage: true });

  // ---------- calendar (Lịch) ----------
  await page.goto(`${BASE}/calendar`);
  const [calYear, calMonth, calDay] = TODAY.split("-").map(Number);
  await page.getByRole("heading", { name: `Tháng ${calMonth}, ${calYear}` }).waitFor();
  const todayCell = page.locator("button[aria-current=date]");
  check("calendar opens on the current month with today selected", (await todayCell.getAttribute("aria-pressed")) === "true" && (await todayCell.textContent())?.trim() === String(calDay));
  check("selected day lists that day's fixed tasks", await page.getByText("Kiểm tra đơn hàng mới").isVisible());
  check("…and ad-hoc tasks due that day", await page.getByText("Gọi lại cho shipper về đơn #1024").isVisible());
  check("no-deadline open ad-hoc is not on the calendar", (await page.getByText("Tìm nhà cung cấp hộp carton mới").count()) === 0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-calendar.png`, fullPage: true });
  await page.getByRole("link", { name: "Tháng sau" }).click();
  await page.waitForURL(/month=\d{4}-\d{2}/);
  await page.getByRole("link", { name: "Tháng này" }).waitFor();
  check("month navigation works", (await page.locator("button[aria-current=date]").count()) === 0);

  for (const adminPath of ["/members", "/overview", "/settings", "/fixed-tasks"]) {
    await page.goto(`${BASE}${adminPath}`);
    check(`employee blocked from ${adminPath}`, path(page) === "/today", page.url());
  }

  await page.goto(`${BASE}/profile`);
  await page.getByLabel("Họ tên").fill("Nguyễn Văn An");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await page.getByText("Đã lưu hồ sơ").waitFor();
  check("employee can save own profile", true);

  await page.getByLabel("Nhắc trước", { exact: true }).selectOption("60");
  await page.getByRole("switch", { name: "Báo việc quá hạn" }).click();
  await page.getByRole("button", { name: "Lưu thông báo" }).click();
  await page.getByText("Đã lưu cài đặt thông báo").waitFor();
  await page.reload();
  check(
    "notification settings persist",
    (await page.getByLabel("Nhắc trước", { exact: true }).inputValue()) === "60" &&
      (await page.getByRole("switch", { name: "Báo việc quá hạn" }).getAttribute("aria-checked")) === "false",
  );
  // Restore the defaults so re-runs and the RLS checks start from the seed state.
  await page.getByLabel("Nhắc trước", { exact: true }).selectOption("30");
  await page.getByRole("switch", { name: "Báo việc quá hạn" }).click();
  await page.getByRole("button", { name: "Lưu thông báo" }).click();
  await page.getByText("Đã lưu cài đặt thông báo").waitFor();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-employee-profile.png`, fullPage: true });

  await logout(page);
  await page.goto(`${BASE}/today`);
  check("after logout, app pages redirect to /login", path(page) === "/login", page.url());

  // ---------- admin ----------
  await login(page, "admin@team.local");
  await page.waitForURL("**/overview");
  check("admin lands on /overview", path(page) === "/overview", page.url());

  // ---------- admin dashboard ----------
  // An today: 3 fixed (none done) + ad-hoc: 1 carried-over overdue, 1 due today, 1 finished today (E2E phát sinh).
  const anCard = page.getByRole("link", { name: /^Nguyễn Văn An:/ });
  await anCard.waitFor();
  const anText = await anCard.textContent();
  check("dashboard card shows fixed and ad-hoc completion per member", anText?.includes("Cố định0/3") && anText.includes("Phát sinh1/3"), anText);
  check("…and flags who is overdue", /quá hạn/.test((await anCard.getAttribute("aria-label")) ?? ""), await anCard.getAttribute("aria-label"));
  const summary = (await page.locator("dl").first().textContent()) ?? "";
  check("summary cards: total · done · not done · overdue", /Tổng việc\d+Đã hoàn thành\d+Chưa hoàn thành\d+Quá hạn\d+/.test(summary), summary);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-admin-overview.png`, fullPage: true });

  // Realtime: an employee ticks a task on another device → the admin's numbers move without a reload.
  const binhCard = page.getByRole("link", { name: /^Trần Thị Bình:/ });
  const fixedBefore = (await binhCard.textContent())?.match(/Cố định(\d+)\/(\d+)/);
  const employeeContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const employeePage = await employeeContext.newPage();
  await login(employeePage, "binh@team.local");
  await employeePage.waitForURL("**/today");
  await page.waitForTimeout(1500); // let the dashboard's Realtime channel finish subscribing
  await employeePage.getByRole("checkbox", { name: "Hoàn thành “Trả lời tin nhắn khách hàng”" }).click();
  const expected = `Cố định${Number(fixedBefore?.[1]) + 1}/${fixedBefore?.[2]}`;
  const live = await page
    .waitForFunction(
      (text) => [...document.querySelectorAll("a")].some((a) => a.getAttribute("aria-label")?.startsWith("Trần Thị Bình:") && a.textContent.includes(text)),
      expected,
      { timeout: 8000 },
    )
    .then(() => true, () => false);
  check("dashboard updates live when an employee completes a task", live, `${fixedBefore?.[0]} → expected ${expected}`);
  await employeePage.getByRole("checkbox", { name: "Mở lại “Trả lời tin nhắn khách hàng”" }).click();
  await employeePage.getByRole("checkbox", { name: "Hoàn thành “Trả lời tin nhắn khách hàng”" }).waitFor();
  await employeeContext.close();

  // Click a member → their tasks by day.
  await anCard.click();
  await page.waitForURL(/member=/);
  const sheet = page.getByRole("dialog");
  await sheet.getByText("E2E phát sinh").waitFor();
  check(
    "member sheet lists the member's tasks by day (carried-over overdue under 'Hôm qua')",
    (await sheet.getByRole("region", { name: /^Hôm qua/ }).getByText("Gửi báo giá cho khách Hưng Thịnh").isVisible()) &&
      (await sheet.getByRole("region", { name: /^Hôm nay/ }).getByText("Kiểm tra đơn hàng mới").isVisible()),
  );
  check("backlog (no deadline) is not counted against the member", (await sheet.getByText("Tìm nhà cung cấp hộp carton mới").count()) === 0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-admin-member-sheet.png` });
  await page.keyboard.press("Escape");
  await page.waitForURL((u) => !u.searchParams.has("member"));
  check("closing the sheet returns to the dashboard", (await page.getByRole("dialog").count()) === 0);

  // Filters
  const filters = page.getByRole("navigation", { name: "Khoảng thời gian" });
  await filters.getByRole("link", { name: "7 ngày" }).click();
  await page.waitForURL(/range=7d/);
  await filters.getByRole("link", { name: "Tháng này" }).click();
  await page.waitForURL(/range=month/);
  check("range filters switch the dashboard", (await filters.getByRole("link", { name: "Tháng này" }).getAttribute("aria-current")) === "page");
  await filters.getByRole("link", { name: "Tuỳ chọn" }).click();
  await page.getByLabel("Từ ngày").fill(TODAY);
  await page.getByLabel("Đến ngày").fill(TODAY);
  await page.getByRole("button", { name: "Xem" }).click();
  await page.waitForURL(new RegExp(`from=${TODAY}&to=${TODAY}`));
  check("custom range matches 'Hôm nay' for the same day", (await page.getByRole("link", { name: /^Nguyễn Văn An:/ }).textContent())?.includes("Phát sinh1/3"));

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
  // Effective range: ending today keeps today's task and shows the end date on the card.
  await page.getByRole("dialog").getByLabel("Đến ngày (tuỳ chọn)").fill(TODAY);
  await page.getByRole("dialog").getByRole("button", { name: "Lưu thay đổi" }).click();
  const [, endMonth, endDay] = TODAY.split("-").map(Number);
  await page.getByText(`Đến ${endDay}/${endMonth}`).waitFor();
  check("admin can set a template's effective end date", true);

  // ---------- admin: system settings ----------
  await page.goto(`${BASE}/settings`);
  await page.getByLabel("Tên team").fill("Team E2E");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await page.getByText("Đã lưu tên team").waitFor();
  check("team name from system settings shows as the brand", await page.getByRole("link", { name: "Team E2E" }).first().isVisible());
  await page.getByLabel("Tên team").fill("Team Todo");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await page.getByRole("link", { name: "Team Todo" }).first().waitFor();

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
