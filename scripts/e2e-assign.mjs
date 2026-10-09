// Assignment & transfer in a real browser: An on a phone, Bình on a desktop, both open at once.
// Requires: local Supabase with seed (`npm run db:reset`) and the app running.
//   E2E_BASE_URL=http://localhost:3123 npm run test:assign
// Set E2E_SCREENSHOTS=<dir> to save screenshots.

import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SCREENSHOTS;
const PASSWORD = "Password123!";
const AN = "Nguyễn Văn An";
const BINH = "Trần Thị Bình";

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → ${detail ?? ""}`}`);
  if (!ok) failed++;
}

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForURL("**/today");
  await page.getByText("Công việc cố định").waitFor();
}

const card = (page, title) => page.getByRole("button", { name: `Chi tiết “${title}”` });

const browser = await chromium.launch({ channel: "msedge" });
try {
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const desktop = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await login(phone, "an@team.local");
  await login(desktop, "binh@team.local");
  // Bình's Realtime channel must be up before An creates anything.
  await desktop.waitForLoadState("networkidle");
  await desktop.waitForTimeout(1500);

  // ---------- Update 1: assign on create ----------
  const stamp = Date.now().toString().slice(-6);
  const given = `Gửi báo giá ${stamp}`;
  const own = `Việc của An ${stamp}`;

  await phone.getByRole("button", { name: "Thêm việc", exact: true }).click();
  const dialog = phone.getByRole("dialog");
  const picker = dialog.getByLabel("Giao cho");
  check("create form has “Giao cho”, defaulting to “Tôi”", (await picker.inputValue()) === "" && (await picker.locator("option:checked").textContent()) === "Tôi");
  const options = await picker.locator("option").allTextContents();
  check("the picker offers teammates, not myself twice", options.includes(BINH) && !options.includes(AN), options.join(" | "));
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/assign-form-phone.png` });

  await dialog.getByLabel("Tên công việc").fill(given);
  await picker.selectOption({ label: BINH });
  await dialog.getByRole("button", { name: "Thêm việc", exact: true }).click();
  await phone.getByText(`Đã giao cho ${BINH}`).waitFor();
  check("assigning to someone else confirms with their name", true);
  check("the task does not land in the creator's own list", (await card(phone, given).count()) === 0);

  await card(desktop, given).waitFor({ timeout: 10_000 }).then(
    () => check("the assignee sees the task at once (no reload)", true),
    () => check("the assignee sees the task at once (no reload)", false, "not on Bình's screen after 10s"),
  );
  check("the assignee's card says who gave it", ((await card(desktop, given).textContent()) ?? "").includes(`Giao bởi: ${AN}`));
  if (SHOTS) await desktop.screenshot({ path: `${SHOTS}/assign-received-desktop.png` });

  await card(desktop, given).click();
  check("the task sheet says who gave it", await desktop.getByRole("dialog").getByText(`Giao bởi: ${AN}`).isVisible());
  await desktop.keyboard.press("Escape");

  // A task for myself: unchanged behaviour, no "Giao bởi".
  await phone.getByRole("button", { name: "Thêm việc", exact: true }).click();
  await dialog.getByLabel("Tên công việc").fill(own);
  await dialog.getByRole("button", { name: "Thêm việc", exact: true }).click();
  await phone.getByText("Đã thêm việc").waitFor();
  check("a task for myself lands in my list, without “Giao bởi”", !((await card(phone, own).textContent()) ?? "").includes("Giao bởi"));
  check("…and never reaches the other member", (await card(desktop, own).count()) === 0);
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/assign-own-phone.png` });

  // ---------- Update 3: "Đã giao" + history ----------
  const row = (page, title) => page.getByRole("button", { name: `Chi tiết “${title}”` });
  await phone.goto(`${BASE}/tasks`);
  const tabs = phone.getByRole("navigation", { name: "Danh sách công việc" });
  await tabs.waitFor(); // the skeleton shows first: wait for content, not for the URL
  check("Công việc has the three tabs", (await tabs.getByRole("link").allTextContents()).map((t) => t.trim()).join("|") === "Của tôi|Đã giao|Đã hoàn thành");
  await row(phone, own).waitFor();
  check("“Của tôi” lists my open tasks, not the one I gave away", (await row(phone, given).count()) === 0);

  await tabs.getByRole("link", { name: "Đã giao" }).click();
  await row(phone, given).waitFor();
  check("“Đã giao” lists the task I gave, with who has it", ((await row(phone, given).textContent()) ?? "").includes(`→ ${BINH}`));
  check(
    "“Đã giao” shows nothing else of the assignee's, and none of my own tasks",
    (await phone.getByText("Trả lời tin nhắn khách hàng").count()) === 0 && (await row(phone, own).count()) === 0,
  );
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/assigned-tab-phone.png` });

  await row(phone, given).click();
  await dialog.getByText("Người phụ trách").waitFor();
  const people = (await dialog.locator("dl").textContent()) ?? "";
  check("task detail names the creator and the assignee", people.includes(`Người tạo${AN}`) && people.includes(`Người phụ trách${BINH}`), people);
  await dialog.getByRole("listitem").first().waitFor();
  const assignedLog = (await dialog.getByRole("listitem").allTextContents()).join(" | ");
  check("history: “Bạn giao việc cho Bình”", assignedLog.includes(`Bạn giao việc cho ${BINH}`), assignedLog);
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/assigned-detail-phone.png` });
  await phone.keyboard.press("Escape");

  // ---------- Update 2 + 3: transfer ----------
  // Phone: the task sheet's "…" opens a bottom sheet of quick actions.
  await phone.goto(`${BASE}/today`);
  await card(phone, own).waitFor();
  const cardButtons = await card(phone, own).locator("xpath=..").getByRole("button").count();
  check("the card itself gains no button (still: open details)", cardButtons === 1, String(cardButtons));
  await card(phone, own).click();
  await phone.getByRole("button", { name: "Thao tác khác" }).click();
  const quick = phone.getByRole("dialog").last();
  await quick.getByText("Thao tác nhanh").waitFor();
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/transfer-actions-phone.png` });
  await quick.getByRole("button", { name: "Chuyển công việc" }).click();
  const receivers = await quick.getByRole("radio").allTextContents();
  check("the receiver list leaves out the current assignee", receivers.includes(BINH) && !receivers.includes(AN), receivers.join(" | "));
  check("nothing is sent before a receiver is chosen", await quick.getByRole("button", { name: "Chuyển", exact: true }).isDisabled());
  await quick.getByRole("radio", { name: BINH }).click();
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/transfer-pick-phone.png` });
  const sentAt = Date.now();
  await quick.getByRole("button", { name: "Chuyển", exact: true }).click();
  await card(phone, own).waitFor({ state: "detached", timeout: 700 }).then(
    () => check("transfer: the card leaves my list at once", true),
    () => check("transfer: the card leaves my list at once", false, `${Date.now() - sentAt}ms`),
  );
  await phone.getByText(`Đã chuyển cho ${BINH}`).waitFor();
  await card(desktop, own).waitFor({ timeout: 10_000 }).then(
    () => check("transfer: the receiver sees it at once (no reload)", true),
    () => check("transfer: the receiver sees it at once (no reload)", false, "not on Bình's screen after 10s"),
  );
  check("…with who it came from", ((await card(desktop, own).textContent()) ?? "").includes(`Giao bởi: ${AN}`));

  // Desktop: the same "…" is a menu.
  await card(desktop, given).click();
  await desktop.getByRole("button", { name: "Thao tác khác" }).click();
  await desktop.getByRole("menuitem", { name: "Chuyển công việc" }).waitFor();
  if (SHOTS) {
    await desktop.waitForTimeout(300); // let the menu finish opening
    await desktop.screenshot({ path: `${SHOTS}/transfer-menu-desktop.png` });
  }
  await desktop.getByRole("menuitem", { name: "Chuyển công việc" }).click();
  const pick = desktop.getByRole("dialog").last();
  await pick.getByRole("radio", { name: "Cường" }).click();
  if (SHOTS) await desktop.screenshot({ path: `${SHOTS}/transfer-pick-desktop.png` });
  await pick.getByRole("button", { name: "Chuyển", exact: true }).click();
  await desktop.getByText("Đã chuyển cho Cường").waitFor();
  await card(desktop, given).waitFor({ state: "detached", timeout: 2000 }).then(
    () => check("desktop: “…” menu → Chuyển công việc → the task leaves the list", true),
    () => check("desktop: “…” menu → Chuyển công việc → the task leaves the list", false, "card still there after 2s"),
  );
  // Both sheets (picker + task) slide out; give the close animation its 200ms.
  await desktop.getByRole("dialog").first().waitFor({ state: "detached", timeout: 2000 }).then(
    () => check("no dialog is left open after a transfer", true),
    () => check("no dialog is left open after a transfer", false, "a dialog is still open after 2s"),
  );

  // A completed task offers no transfer.
  await desktop.getByRole("checkbox", { name: `Hoàn thành “${own}”` }).click();
  await desktop.getByText(`Đã xong “${own}”`).waitFor();
  await desktop.getByRole("button", { name: /^Đã xong/ }).click();
  await card(desktop, own).click();
  await desktop.getByRole("dialog").getByLabel("Tên công việc").waitFor();
  check("a completed task has no “Chuyển công việc”", (await desktop.getByRole("button", { name: "Thao tác khác" }).count()) === 0);
  await desktop.keyboard.press("Escape");

  // The creator follows the task on "Đã giao": new assignee + the transfer in its history.
  await phone.goto(`${BASE}/tasks?tab=assigned`);
  await row(phone, given).waitFor();
  check("“Đã giao” follows the task to its new assignee", ((await row(phone, given).textContent()) ?? "").includes("→ Cường"));
  check("a task I created for myself and then transferred is on “Đã giao” too", (await row(phone, own).count()) === 1);
  await row(phone, given).click();
  await dialog.getByText("chuyển việc").waitFor();
  const movedLog = (await dialog.getByRole("listitem").allTextContents()).join(" | ");
  check("history: “Bình chuyển việc từ Bình sang Cường”", movedLog.includes(`${BINH} chuyển việc từ ${BINH} sang Cường`), movedLog);
  check("the creator can still reassign from the detail sheet", await phone.getByRole("button", { name: "Thao tác khác" }).isVisible());
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/transfer-history-phone.png` });
  await phone.keyboard.press("Escape");

  // Bình no longer has anything to do with the task that went to Cường.
  await desktop.goto(`${BASE}/tasks`);
  await desktop.getByRole("navigation", { name: "Danh sách công việc" }).waitFor();
  check("the previous assignee no longer sees the transferred task", (await row(desktop, given).count()) === 0);
  if (SHOTS) await desktop.screenshot({ path: `${SHOTS}/mine-tab-desktop.png` });

  // ---------- Update 4: notifications (delivered by the per-minute engine tick) ----------
  async function inbox(page) {
    await page.goto(`${BASE}/notifications`);
    await page.getByRole("heading", { name: "Thông báo" }).first().waitFor();
    return (await page.locator("main").textContent()) ?? "";
  }
  let binhInbox = "";
  for (let attempt = 0; attempt < 9 && !(binhInbox.includes(given) && binhInbox.includes(own)); attempt++) {
    if (attempt > 0) await desktop.waitForTimeout(10_000);
    binhInbox = await inbox(desktop);
  }
  check("assign: the assignee is notified (“Bạn có công việc mới” · task · who gave it)", binhInbox.includes("Bạn có công việc mới") && binhInbox.includes(given) && binhInbox.includes(`Người giao: ${AN}`));
  check("transfer: the receiver is notified (“Bạn vừa nhận một công việc” · task · from whom)", binhInbox.includes("Bạn vừa nhận một công việc") && binhInbox.includes(own) && binhInbox.includes(`Chuyển từ: ${AN}`));
  if (SHOTS) await desktop.screenshot({ path: `${SHOTS}/notifications-desktop.png` });
  const anInbox = await inbox(phone);
  check("the person who assigned / transferred gets no notification about it", !anInbox.includes(given) && !anInbox.includes(own), anInbox.slice(0, 200));

  // ---------- admin: can reassign from the dashboard's member sheet ----------
  const adminPage = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await adminPage.goto(`${BASE}/login`);
  await adminPage.getByLabel("Email").fill("admin@team.local");
  await adminPage.getByLabel("Mật khẩu").fill(PASSWORD);
  await adminPage.getByRole("button", { name: "Đăng nhập" }).click();
  await adminPage.waitForURL("**/overview");
  await adminPage.goto(`${BASE}/overview?member=00000000-0000-4000-8000-000000000002`);
  await row(adminPage, "Gọi lại cho shipper về đơn #1024").click();
  const adminDetail = adminPage.getByRole("dialog").last();
  await adminDetail.getByText("Người phụ trách").waitFor();
  check("admin: a member's ad-hoc task can be reassigned from the dashboard", await adminPage.getByRole("button", { name: "Thao tác khác" }).isVisible());
  await adminPage.keyboard.press("Escape");
  await row(adminPage, "Kiểm tra đơn hàng mới").click();
  await adminDetail.getByText("Việc cố định").waitFor();
  check("admin: a FIXED task offers no transfer", (await adminPage.getByRole("button", { name: "Thao tác khác" }).count()) === 0);
} finally {
  await browser.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll assignment checks passed");
process.exit(failed ? 1 : 0);
