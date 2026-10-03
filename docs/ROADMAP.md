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
- [ ] Deploy Vercel (đặt env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
