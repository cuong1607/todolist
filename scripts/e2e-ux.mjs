// UX checks in a real browser (Phase 16): skeletons, optimistic create/edit/note, side sheets.
// Slows the network down on purpose so "instant" is observable.
// Requires: local Supabase with seed (`npm run db:reset`) and the app running.
//   npm run build && npm start -- -p 3123   (in another terminal)
//   E2E_BASE_URL=http://localhost:3123 npm run test:ux
// Set E2E_SCREENSHOTS=<dir> to save screenshots.

import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SCREENSHOTS;
const PASSWORD = "Password123!";
/** How long every server round-trip is held back while a check is watching. */
const DELAY_MS = 1500;

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
}

/** Hold back Server Actions (POST) and page data (RSC) so optimistic UI and skeletons can be seen. */
async function slowDown(page) {
  await page.route(
    (url) => url.origin === new URL(BASE).origin,
    async (route) => {
      const request = route.request();
      const isAction = request.method() === "POST";
      const isPageData = request.headers()["rsc"] === "1" && !request.headers()["next-router-prefetch"];
      if (isAction || isPageData) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      await route.continue();
    },
  );
}

const browser = await chromium.launch({ channel: "msedge" });
try {
  // ---------- employee, phone ----------
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await login(phone, "an@team.local");
  await phone.waitForURL("**/today");
  await phone.getByText("Công việc cố định").waitFor();
  // Let the links prefetch their loading state first, as they do on any page a person has had open for a moment.
  await phone.waitForLoadState("networkidle");
  await slowDown(phone);
  const skeleton = phone.locator("[data-slot=page-skeleton]");
  const region = (name) => phone.getByRole("region", { name });

  // Skeleton: tapping a tab answers at once, inside the shell.
  await phone.getByRole("link", { name: "Công việc", exact: true }).click();
  await skeleton.waitFor({ timeout: 700 }).then(
    () => check("navigation shows a skeleton at once (no blank wait, no full-screen spinner)", true),
    () => check("navigation shows a skeleton at once (no blank wait, no full-screen spinner)", false, "no skeleton within 700ms"),
  );
  check("the shell stays on screen while the page loads", await phone.getByRole("navigation", { name: "Điều hướng chính" }).isVisible());
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/ux-skeleton.png` });
  await skeleton.waitFor({ state: "detached" });
  await phone.getByRole("link", { name: "Hôm nay", exact: true }).click();
  await phone.getByText("Công việc cố định").waitFor();

  // Optimistic create: the card is there long before the server answers.
  await phone.getByRole("button", { name: "Thêm việc", exact: true }).click();
  const dialog = phone.getByRole("dialog");
  await dialog.getByLabel("Tên công việc").fill("UX tạo nhanh");
  const createdAt = Date.now();
  await dialog.getByRole("button", { name: "Thêm việc", exact: true }).click();
  await region(/^Việc đang tồn/).getByText("UX tạo nhanh").waitFor({ timeout: 700 });
  check("create: the new card appears at once", Date.now() - createdAt < 700, `${Date.now() - createdAt}ms`);
  await dialog.waitFor({ state: "hidden", timeout: 700 }).then(
    () => check("create: the sheet closes at once", true),
    () => check("create: the sheet closes at once", false, "still open after 700ms"),
  );
  await phone.getByText("Đã thêm việc").waitFor();
  check("create: one card after the server confirms (no duplicate from Realtime)", (await phone.getByText("UX tạo nhanh").count()) === 1);
  await phone.reload();
  check("create: it was really saved", await region(/^Việc đang tồn/).getByText("UX tạo nhanh").isVisible());

  // Optimistic edit: change the deadline, the card moves at once.
  await phone.getByRole("button", { name: "Chi tiết “UX tạo nhanh”" }).click();
  await dialog.getByRole("radio", { name: "Hôm nay" }).click();
  const editedAt = Date.now();
  await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
  await region(/^Đến hạn hôm nay/).getByText("UX tạo nhanh").waitFor({ timeout: 700 });
  check("change deadline: the card moves to its new section at once", Date.now() - editedAt < 700, `${Date.now() - editedAt}ms`);
  await phone.getByText("Đã lưu", { exact: true }).waitFor();

  // Optimistic complete + reopen.
  const tick = phone.getByRole("checkbox", { name: "Hoàn thành “UX tạo nhanh”" });
  await tick.click();
  await phone.getByRole("checkbox", { name: "Mở lại “UX tạo nhanh”" }).waitFor({ timeout: 700 });
  check("complete: the tick shows at once", true);
  await phone.getByText("Đã xong “UX tạo nhanh”").waitFor();
  await phone.getByRole("button", { name: "Hoàn tác" }).click();
  await tick.waitFor({ timeout: 700 });
  check("reopen: the tick clears at once", true);
  await phone.waitForTimeout(DELAY_MS + 500);

  // Optimistic note on a fixed task.
  await phone.getByRole("button", { name: "Chi tiết “Báo cáo tồn kho cuối ngày”" }).click();
  await dialog.getByLabel("Ghi chú của bạn").fill("UX ghi chú");
  const notedAt = Date.now();
  await dialog.getByRole("button", { name: "Lưu ghi chú" }).click();
  // The card sits behind the open sheet (hidden from the accessibility tree), so look at the DOM.
  await phone.locator("section", { hasText: "Công việc cố định" }).getByText("UX ghi chú").waitFor({ state: "attached", timeout: 700 });
  check("edit note: the card shows the note at once", Date.now() - notedAt < 700, `${Date.now() - notedAt}ms`);
  check("edit note: the save button settles at once", await dialog.getByRole("button", { name: "Lưu ghi chú" }).isDisabled());

  // Mobile: details open as a bottom sheet.
  const mobileBox = await dialog.boundingBox();
  check("mobile: task detail is a bottom sheet", !!mobileBox && Math.round(mobileBox.y + mobileBox.height) === 844 && mobileBox.width === 390, JSON.stringify(mobileBox));
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/ux-bottom-sheet.png` });
  await phone.getByText("Đã lưu ghi chú").waitFor();
  await phone.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  // Everything done → the friendly message.
  await phone.unroute("**/*");
  for (let guard = 0; guard < 20; guard++) {
    const open = phone.getByRole("checkbox", { name: /^Hoàn thành/ });
    const sections = [region(/^Công việc cố định/), region(/^Đến hạn hôm nay/), region(/^Quá hạn/)];
    let ticked = false;
    for (const section of sections) {
      const box = section.getByRole("checkbox", { name: /^Hoàn thành/ }).first();
      if ((await section.count()) > 0 && (await box.count()) > 0) {
        await box.click();
        await phone.waitForTimeout(900);
        ticked = true;
        break;
      }
    }
    if (!ticked || (await open.count()) === 0) break;
  }
  check("all done: 'Bạn đã hoàn thành toàn bộ công việc hôm nay.'", await phone.getByText("Bạn đã hoàn thành toàn bộ công việc hôm nay.").isVisible());
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/ux-all-done.png`, fullPage: true });
  await phone.context().close();

  // ---------- admin, desktop ----------
  const desktop = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await login(desktop, "admin@team.local");
  await desktop.waitForURL("**/overview");
  await desktop.getByRole("link", { name: /Nguyễn Văn An/ }).first().waitFor();
  if (SHOTS) await desktop.screenshot({ path: `${SHOTS}/ux-overview-desktop.png`, fullPage: true });

  await desktop.waitForLoadState("networkidle");
  await slowDown(desktop);
  const memberCard = desktop.getByRole("link", { name: /Nguyễn Văn An/ }).first();
  await memberCard.click();
  // Opening the sheet keeps the dashboard on screen, so the card itself has to answer the click.
  await memberCard.locator(".animate-spin").waitFor({ timeout: 700 }).then(
    () => check("desktop: a tapped member card shows its own pending state (no page skeleton)", true),
    () => check("desktop: a tapped member card shows its own pending state (no page skeleton)", false, "no spinner within 700ms"),
  );
  check("…and the dashboard stays on screen meanwhile", (await desktop.locator("[data-slot=page-skeleton]").count()) === 0);
  const sheet = desktop.getByRole("dialog");
  await sheet.waitFor();
  await desktop.waitForTimeout(400);
  const sheetBox = await sheet.boundingBox();
  check(
    "desktop: member detail is a side sheet (full height, on the right edge)",
    !!sheetBox && Math.round(sheetBox.x + sheetBox.width) === 1280 && Math.round(sheetBox.height) === 800,
    JSON.stringify(sheetBox),
  );
  await desktop.unroute("**/*");
  await sheet.getByRole("button", { name: /^Chi tiết/ }).first().click();
  const detail = desktop.getByRole("dialog").last();
  await detail.getByText("Lịch sử").waitFor();
  await desktop.waitForTimeout(400); // let the slide-in finish before measuring
  const detailBox = await detail.boundingBox();
  check(
    "desktop: task detail is a side sheet, not a centered modal",
    !!detailBox && Math.round(detailBox.x + detailBox.width) === 1280 && Math.round(detailBox.height) === 800,
    JSON.stringify(detailBox),
  );
  if (SHOTS) await desktop.screenshot({ path: `${SHOTS}/ux-side-sheet.png` });
  await desktop.context().close();

  console.log(failed === 0 ? "\nAll UX checks passed" : `\n${failed} UX check(s) failed`);
} finally {
  await browser.close();
}
process.exit(failed === 0 ? 0 : 1);
