# TEAM TODO — DEVELOPMENT ROADMAP

## Phase 0. Mục tiêu sản phẩm

Xây hệ thống quản lý công việc nội bộ cho team nhỏ, hiện tại khoảng 6 người.

Hệ thống có 2 role:

- `ADMIN`
- `EMPLOYEE`

Triết lý sản phẩm:

- Đơn giản
- Dễ dùng
- UI/UX đẹp, thân thiện
- Tốc độ thao tác nhanh
- Mobile-first
- Responsive tốt trên web
- Animation mượt
- Không biến thành Jira / ClickUp thu nhỏ
- Nhân viên mở app là biết hôm nay phải làm gì
- Admin mở app là biết team đang làm đến đâu

Hai loại công việc chính:

1. **Fixed Task** — công việc cố định
2. **Ad-hoc Task** — công việc phát sinh

## Tech stack

| Hạng mục | Lựa chọn |
| --- | --- |
| Frontend | Next.js (App Router) + TypeScript |
| Backend / Database | Supabase + PostgreSQL |
| Auth | Supabase Auth |
| Authorization | Supabase Row Level Security |
| Realtime | Supabase Realtime |
| Scheduled jobs | Supabase Cron / pg_cron; Edge Functions khi cần gọi API bên ngoài |
| UI | Tailwind CSS + shadcn/ui |
| Animation | Motion (`motion/react`) |
| Validation | Zod |
| Icons | Lucide |
| Deployment | Vercel (Next.js) + Supabase (DB/Auth/Realtime/Functions) |

### Trạng thái Phase 0

- [x] Scaffold Next.js 16 + TypeScript + Tailwind v4 + ESLint
- [x] shadcn/ui (button, card, input, label, badge, sonner)
- [x] Supabase clients: browser, server, proxy (refresh session)
- [x] Zod validate biến môi trường
- [x] Layout tiếng Việt, font Be Vietnam Pro, dark mode, Motion tôn trọng reduced-motion
## Phase 1. Foundation + Supabase setup

- [x] TypeScript strict (+ `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`)
- [x] Supabase local (CLI + Docker), `.env.local` trỏ vào local
- [x] SSR auth: browser client, server client, proxy refresh session; typed với `Database`
- [x] Migration đầu tiên `20261003000000_foundation.sql` (schema `private`, `set_updated_at()`, `app_health()`)
- [x] `/api/health` + thẻ trạng thái kết nối ở Cài đặt
- [x] Design tokens trong `globals.css` + `src/lib/motion.ts`; trang xem trước `/design`
- [x] Light/Dark/System theme (toggle ở header, selector ở Cài đặt)
- [x] Responsive shell: sidebar + header (desktop), top bar + bottom nav + FAB (mobile)
- [x] Tạo Supabase project cloud (`todolist`, ref `xrfmtrknmtovruzrrkmh`)
- [x] `supabase link` + migrations trên cloud (đủ 6 migration, `db push --dry-run` báo up to date); đã có tài khoản admin
- [x] Tắt signup công khai trên cloud (`auth.enable_signup = false`). Lưu ý: không `supabase config push` cả file `config.toml` — nó sẽ đổi thêm xác nhận email, MFA, redirect URL trên cloud
- [x] Vercel project `todolist` (https://todolist-indol-phi.vercel.app) với env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (Production)
- [ ] Deploy bản mới nhất lên production: `vercel deploy --prod`

## Phase 2. Supabase Auth + Role + Profile

- [x] Đăng nhập email/password, đăng xuất, giữ phiên qua cookie SSR (proxy refresh)
- [x] Tắt đăng ký tự do; admin tạo tài khoản ở `/members`
- [x] Bảng `profiles` + enum `app_role` (ADMIN/EMPLOYEE), tự tạo khi có user mới (luôn EMPLOYEE)
- [x] RLS: employee chỉ đọc/sửa profile của mình; admin đọc/sửa tất cả
- [x] Trigger chặn sửa `role`/`active`/`email`/`zalo_*` từ client; admin không tự hạ quyền/khoá mình
- [x] Khoá thành viên = `active = false` + ban ở Auth (không đăng nhập/refresh được)
- [x] Layout theo role: ADMIN → Tổng quan/Công việc/Thành viên/Cài đặt; EMPLOYEE → Hôm nay/Công việc/Hồ sơ
- [x] Màn hình: Đăng nhập, Hồ sơ, Thành viên (admin)
- [x] `npm run test:rls` (17 check qua Data API), `npm run test:e2e` (17 check trên trình duyệt)
- [x] Policy cho settings: `system_settings` (member đọc, admin ghi), `notification_settings` (của mình; admin đọc) — làm ở Phase 3
- [ ] Policy cho report: chưa có bảng report (chưa có spec)

## Phase 3. Database Core Schema

Làm sau Phase 4–5 (spec đến sau) — migration `20261003040000_core_schema.sql` chốt lại schema:

- [x] Đổi tên cột theo spec: `default_note`, `days_of_week`, `fixed_template_id`, `deadline_at`; `status` → `completed` (boolean)
- [x] `fixed_task_templates.effective_from` / `effective_to` (generator tôn trọng khoảng hiệu lực)
- [x] `tasks.task_date` nullable: có cho FIXED, null cho ADHOC (check constraint)
- [x] `task_history`: trigger ghi mọi thay đổi (CREATED/UPDATED/RESCHEDULED/COMPLETED/REOPENED), chỉ đọc với client
- [x] `notification_settings` (1 dòng/thành viên, tự tạo), `notification_logs` (server ghi, `dedupe_key` chống gửi trùng), `system_settings` (key/value)
- [x] Index: `tasks.assignee_id`, `task_date`, `deadline_at`, `completed`, `type`; `fixed_task_templates.assignee_id`; + history/log
- [x] Unique `(fixed_template_id, task_date)` — không sinh trùng
- [x] RLS bật trên mọi bảng public (có test)
- [x] Test: `test:db` (75), `test:rls` (70), `test:e2e` (40)
- [x] UI `effective_from/to`: "Thời gian hiệu lực" trong dialog việc cố định; thẻ hiện "Từ … / Đến … / Hết hiệu lực …"
- [x] UI cài đặt thông báo ở Tài khoản (tóm tắt sáng + giờ gửi, nhắc trước deadline, báo quá hạn) — mới lưu cấu hình, chưa có job gửi
- [x] UI system settings ở Cài đặt: tên team (hiện ở logo cho mọi thành viên)

## Phase 4. Fixed Task Management

- [x] Bảng `fixed_task_templates` (theo từng thành viên: tiêu đề, hướng dẫn, hạn trong ngày, ngày trong tuần, cho phép ghi chú, thứ tự, bật/tắt)
- [x] Bảng `tasks` dùng chung FIXED/ADHOC, snapshot title/note/due_at khi sinh
- [x] Admin: tạo / sửa / tắt / kéo thả sắp xếp ở `/fixed-tasks`; chỉ xoá được khi chưa từng sinh task (FK RESTRICT)
- [x] Employee: xem, hoàn thành, mở lại, ghi chú (nếu cho phép) — chỉ việc của hôm nay; không đổi hạn/ngày/tiêu đề, không xoá
- [x] `private.generate_fixed_tasks()` idempotent + pg_cron 00:05 Asia/Bangkok; đã kiểm chứng job chạy thật
- [x] Template mới áp dụng ngay hôm nay (`ensure_today_fixed_tasks()`), không back-fill quá khứ
- [x] Test: `test:db` (16 pgTAP), `test:rls` (41), `test:e2e` (30)

## Phase 5. Ad-hoc Task

- [x] Employee tạo nhanh (tên bắt buộc; deadline + ghi chú tuỳ chọn) qua FAB / nút "Thêm việc" ở Hôm nay
- [x] Chỉ tạo cho chính mình: trigger lấy assignee/ngày/người tạo từ session, từ chối mọi giá trị khác
- [x] Sửa tên, ghi chú, dời deadline, hoàn thành, mở lại — kể cả việc tồn từ ngày trước
- [x] Carry-over: việc chưa xong hiện mỗi ngày đến khi xong, có nhãn "Tồn từ …"
- [x] Trạng thái suy ra (không lưu): UPCOMING / TODAY / OVERDUE / COMPLETED — `display_status()` (SQL) + `deriveStatus()` (TS), tự cập nhật mỗi phút
- [x] Không deadline → không bao giờ quá hạn, nằm trong "Việc đang tồn"
- [x] Hôm nay chia nhóm: Quá hạn · Hôm nay · Việc đang tồn · Sắp tới · Đã xong
- [x] Test: `test:db` (33), `test:rls` (54), `test:e2e` (40)
- [x] Lịch sử ở trang Công việc: theo ngày (14 ngày/trang), việc cố định đã xong/bỏ lỡ + việc phát sinh đã xong; chạm để xem chi tiết và nhật ký thay đổi (`task_history`)
- Không làm: xoá việc phát sinh (spec không cho)

## Phase 6. Employee Today Experience

- [x] Header: lời chào theo giờ + tên gọi, ngày, "x/y công việc hoàn thành" + thanh tiến độ
- [x] Nhóm theo spec: Cố định · Đến hạn hôm nay · Quá hạn · Việc đang tồn · Sắp tới (thu gọn) · Đã xong (thu gọn)
- [x] Thẻ tối giản (checkbox · tên · deadline · 1 dòng ghi chú); chi tiết/sửa/ghi chú mở trong sheet
- [x] Tick 1 chạm: optimistic, không reload/re-render trang, toast "Hoàn tác"; việc phát sinh xong đứng yên 0,7s rồi mới chuyển nhóm
- [x] Realtime: đồng bộ thay đổi từ thiết bị/tab khác; tự làm mới khi quay lại tab và khi qua nửa đêm
- [x] Mobile: bottom nav Hôm nay · Lịch · Công việc · Tài khoản; FAB "+ Thêm việc"; dialog thành bottom sheet; checkbox vùng chạm 48px
- [x] Animation 150–250ms
- [x] Trang Lịch (bản tối giản, chưa có spec riêng): lưới tháng có chấm trạng thái, chọn ngày để xem việc; chỉ xem — tick vẫn ở Hôm nay. Ngày tương lai chỉ có việc phát sinh có deadline (việc cố định sinh theo ngày)
- [x] Test: `test:e2e` (51)

## Phase 7. Admin Dashboard

- [x] `/overview`: thẻ tổng (Tổng việc · Đã hoàn thành · Chưa hoàn thành · Quá hạn) + thẻ từng nhân viên (avatar, tên, Cố định x/y, Phát sinh x/y, Quá hạn, thanh tiến độ, nhãn "Xong hết / Còn n việc / n quá hạn")
- [x] Bấm nhân viên → sheet (bottom sheet trên mobile, side sheet từ `sm`) liệt kê việc theo ngày; chạm việc để xem chi tiết, ghi chú của nhân viên và nhật ký thay đổi
- [x] Bộ lọc: Hôm nay · 7 ngày · Tuần này · Tháng này · Tuỳ chọn (tối đa 31 ngày); lưu trên URL
- [x] Realtime: số liệu tự cập nhật khi nhân viên tick (không reload); tự làm mới mỗi phút để "quá hạn" luôn đúng
- [x] Một định nghĩa "việc thuộc khoảng thời gian" trong SQL (`private.task_in_range`) cho cả số tổng (`team_overview`) và danh sách (`tasks_in_range`). Việc phát sinh không deadline chưa xong ("việc đang tồn") không tính — giống thanh tiến độ ở Hôm nay
- [x] Test: `test:db` (83), `test:rls` (+5), `test:e2e` (60)
- [ ] Đẩy migration `20261005004136_team_overview` lên cloud (`npm run db:push`) rồi deploy
