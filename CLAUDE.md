@AGENTS.md

# Team Todo

Internal task manager for a ~6-person team. Roadmap and product principles: [docs/ROADMAP.md](docs/ROADMAP.md).

## Product rules
- Roles: `ADMIN`, `EMPLOYEE`. Task types: Fixed (recurring) and Ad-hoc.
- Keep it simple — do not add Jira/ClickUp-style features (sprints, story points, custom workflows) unless the roadmap asks.
- Mobile-first: design for ~375px width first, then scale up.
- UI text is Vietnamese.

## Code conventions
- Next.js 16: `src/proxy.ts` (not `middleware.ts`); `cookies()`, `params`, `searchParams` are async.
- Supabase: `@/lib/supabase/client` in Client Components, `@/lib/supabase/server` on the server.
- `@/lib/supabase/admin` (secret key, bypasses RLS) is ONLY for Auth admin calls (create user, ban) after `requireAdmin()`. Never use it for business data.
- Authorization is enforced by RLS in Postgres; UI checks are convenience only.

## Auth
- Current user: `getCurrentProfile()` / `requireUser()` / `requireAdmin()` from `@/lib/auth`. The user id always comes from the session (`getClaims`) — never accept a user id from the client for "who am I".
- Every Server Function starts with `requireUser()` or `requireAdmin()`, even if the page is already gated.
- Admin-only pages live in `src/app/(app)/(admin)/` (layout calls `requireAdmin()`).
- Home per role: `homePathFor()` — ADMIN → `/overview`, EMPLOYEE → `/today`. Nav per role: `navByRole` in `@/lib/navigation`.
- No public signup (`enable_signup = false`); admins create members on `/members`. Deactivating = `profiles.active = false` + Auth ban.
- RLS helpers for new tables: `private.is_admin()`, `private.is_active_user()`. Pattern: employees see rows where `assignee_id = (select auth.uid())`, admins see all.
- Profile column guard trigger blocks clients from changing `role`/`active` (non-admin), `email`, `zalo_*`. Zalo fields are written server-side only.

## Tasks
- `fixed_task_templates` (admin-only definitions) → `tasks` (per-day instances, `type` FIXED/ADHOC). FIXED rows are created ONLY by `private.generate_fixed_tasks(date)`.
- Generation is idempotent via `unique (template_id, task_date)` + `on conflict do nothing`. pg_cron job `generate-fixed-tasks` runs `5 17 * * *` UTC = 00:05 Asia/Bangkok. Admin actions call `ensure_today_fixed_tasks()` so new templates show today.
- Tasks snapshot title/note/due_at/sort_order at generation; template edits never rewrite existing tasks.
- `tasks.template_id` is `on delete restrict`: templates with history can't be hard-deleted — disable (`active = false`).
- `private.guard_task_update()`: clients may only change `status` and `employee_note` (only if `allow_employee_note`); employees only on today's tasks. `completed_at/by` are stamped by the trigger.
- Timezone: `private.app_timezone()` in SQL and `APP_TIMEZONE` in `@/lib/time` — keep in sync. Use `todayLocal()` for `task_date` in the app.
- Validate all external input (forms, Server Function args) with Zod.
- Animations: `motion/react`; keep them short (≤ 300–400ms) and subtle.
- Add UI components with `npx shadcn@latest add <name>`.

## Database
- Every schema change goes through a migration: `npm run db:new <name>` → edit SQL in `supabase/migrations/` → `npm run db:reset` → `npm run db:types`.
- Never change the database by hand (Studio/SQL editor) without a matching migration.
- Internal helpers go in the `private` schema (not exposed via the Data API). Reuse `private.set_updated_at()` for `updated_at` columns.
- Secrets (service_role, Zalo, etc.) only in Edge Function / server env — never `NEXT_PUBLIC_*`.

## Design system
- Tokens live in `src/app/globals.css` (CSS vars → Tailwind utilities) and `src/lib/motion.ts`. Preview at `/design`.
- Use semantic utilities (`bg-surface`, `text-muted-foreground`, `bg-success-soft`, `shadow-card`, `text-title`, `px-gutter`) — no raw hex/oklch in components.
- Shell: `src/components/shell/`. Pages inside `src/app/(app)/` get the shell automatically. Use `PageHeader`, `EmptyState`, `Fab`.
- Server Components can't pass icon components to Client Components — pass elements (`icon={<Users />}`).
- Windows/PowerShell 5.1 writes UTF-8 with BOM; avoid it for config/env files (the Supabase CLI fails to parse them).

## Commands
- `npm run dev` — dev server
- `npm run build` — production build
- `npm run lint` / `npm run typecheck`
- `npm run db:start` / `db:stop` / `db:status` — local Supabase (needs Docker running)
- `npm run db:reset` — rebuild local DB from migrations + seed
- `npm run db:types` — regenerate `src/types/database.ts`
- `npm run test:rls` — RLS checks via the Data API (needs `db:reset` seed). Run after every migration touching policies.
- `npm run test:db` — pgTAP tests in `supabase/tests/` (generation, idempotency, snapshots)
- `npm run test:e2e` — browser auth flow via installed Edge (app must be running; set `E2E_BASE_URL`)
- Seed accounts (local only, password `Password123!`): `admin@team.local`, `an@team.local`, `binh@team.local`
