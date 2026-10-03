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
- [ ] Tạo Supabase project cloud, `supabase link`, `npm run db:push`
- [ ] Deploy Vercel (đặt env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`)

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
- [ ] Policy cho report/settings: làm cùng bảng tương ứng ở phase sau (dùng `private.is_admin()`)

## Phase 3

- [ ] Chưa nhận spec. Bảng `tasks` (Phase 4) đã có `type = 'ADHOC'` để dùng lại.

## Phase 4. Fixed Task Management

- [x] Bảng `fixed_task_templates` (theo từng thành viên: tiêu đề, hướng dẫn, hạn trong ngày, ngày trong tuần, cho phép ghi chú, thứ tự, bật/tắt)
- [x] Bảng `tasks` dùng chung FIXED/ADHOC, snapshot title/note/due_at khi sinh
- [x] Admin: tạo / sửa / tắt / kéo thả sắp xếp ở `/fixed-tasks`; chỉ xoá được khi chưa từng sinh task (FK RESTRICT)
- [x] Employee: xem, hoàn thành, mở lại, ghi chú (nếu cho phép) — chỉ việc của hôm nay; không đổi hạn/ngày/tiêu đề, không xoá
- [x] `private.generate_fixed_tasks()` idempotent + pg_cron 00:05 Asia/Bangkok; đã kiểm chứng job chạy thật
- [x] Template mới áp dụng ngay hôm nay (`ensure_today_fixed_tasks()`), không back-fill quá khứ
- [x] Test: `test:db` (16 pgTAP), `test:rls` (41), `test:e2e` (30)
