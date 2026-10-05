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
- Validate all external input (forms, Server Function args) with Zod.
- Animations: `motion/react`; keep them short (≤ 300–400ms) and subtle.
- Add UI components with `npx shadcn@latest add <name>`.

## Auth
- Current user: `getCurrentProfile()` / `requireUser()` / `requireAdmin()` from `@/lib/auth`. The user id always comes from the session (`getClaims`) — never accept a user id from the client for "who am I".
- Every Server Function starts with `requireUser()` or `requireAdmin()`, even if the page is already gated.
- Admin-only pages live in `src/app/(app)/(admin)/` (layout calls `requireAdmin()`).
- Home per role: `homePathFor()` — ADMIN → `/overview`, EMPLOYEE → `/today`. Nav per role: `navByRole` in `@/lib/navigation`.
- No public signup (`enable_signup = false`); admins create members on `/members`. Deactivating = `profiles.active = false` + Auth ban.
- RLS helpers for new tables: `private.is_admin()`, `private.is_active_user()`. Pattern: employees see rows where `assignee_id = (select auth.uid())`, admins see all.
- Profile column guard trigger blocks clients from changing `role`/`active` (non-admin), `email`, `zalo_*`. Zalo fields are written server-side only.

## Tasks
Schema (Phase 3): `fixed_task_templates`, `tasks`, `task_history`, `notification_settings`, `notification_logs`, `system_settings`.
- `fixed_task_templates` (admin-only: `default_note`, `days_of_week` ISO 1–7, `effective_from`/`effective_to`) → `tasks` (`type` FIXED/ADHOC). FIXED rows are created ONLY by `private.generate_fixed_tasks(date)`.
- Generation is idempotent via `unique (fixed_template_id, task_date)` + `on conflict do nothing`. pg_cron job `generate-fixed-tasks` runs `5 17 * * *` UTC = 00:05 Asia/Bangkok. Admin actions call `ensure_today_fixed_tasks()` so new templates show today.
- FIXED tasks snapshot title/note/deadline_at/sort_order at generation; template edits never rewrite existing tasks.
- `tasks.fixed_template_id` is `on delete restrict`: templates with history can't be hard-deleted — disable (`active = false`).
- Stored state is only `completed` (+ `completed_at/by`, stamped by trigger). `task_date` is set for FIXED, null for ADHOC (enforced by check).
- `private.guard_task_update()`: FIXED — clients change only `completed` and `employee_note` (if `allow_employee_note`), employees only on today's task. ADHOC — owner may also edit `title`/`note`/`deadline_at` on any day. Nobody deletes tasks.
- ADHOC: employees create for themselves only (`guard_task_insert` forces assignee/creator from the session — never send `assignee_id`). No time picked = 23:59 local.
- Unfinished ADHOC tasks carry over: Today = "today's FIXED + all open ADHOC + ADHOC completed today". Carry-over label uses `created_at`.
- Display status (UPCOMING/TODAY/OVERDUE/COMPLETED) is derived, never stored: SQL `public.display_status(tasks)` (computed column) and TS `deriveStatus()` in `@/lib/task-status` — keep both in sync. No deadline → never overdue ("Việc đang tồn").
- `task_history` is written only by the `log_task_change` trigger (CREATED/UPDATED/RESCHEDULED/COMPLETED/REOPENED, changed fields only; `actor_id` null = system). Read-only for clients.
- `notification_settings` row per profile (auto-created); `profiles.notification_enabled` is the master switch. `notification_logs` are written by server jobs only — use `dedupe_key` to make sends idempotent. `system_settings`: members read, admins write.
- Timezone: `private.app_timezone()` in SQL and `APP_TIMEZONE` in `@/lib/time` — keep in sync. Use `todayLocal()` for `task_date` in the app.

## Today screen (Phase 6)
- `src/app/(app)/today/`: `TodayView` owns task state client-side — optimistic ticks, merges of rows returned by actions, Supabase Realtime (`tasks` is in the `supabase_realtime` publication). Today actions return the row (`TODAY_TASK_COLUMNS`) and do NOT `revalidatePath` — ticking never re-renders the page.
- Realtime: call `supabase.realtime.setAuth(token)` before `subscribe()`, otherwise RLS evaluates as anon and no events arrive. Ignore echoes for ids in flight.
- Sections (spec order): Cố định → Đến hạn hôm nay → Quá hạn → Việc đang tồn → Sắp tới (collapsed) → Đã xong (collapsed). Fixed tasks stay in their section when done; completed ad-hoc cards settle 700ms before moving.
- Cards stay minimal (checkbox · title · deadline · 1-line note); details/edit/notes open in a sheet. Interaction animations 150–250ms.
- `Dialog` renders as a bottom sheet below `sm`. `Fab` adds its own bottom spacer; use `extended` for the screen's primary action.

## History, calendar, settings
- `/tasks` (history) and `/calendar` are read-only: they reuse `TODAY_TASK_COLUMNS`/`TodayTask`, and share `TaskRow` + `TaskDetailDialog` from `src/app/(app)/tasks/`. Ticking/editing stays on Today.
- History is paged by date window (`?before=YYYY-MM-DD`, 14 days): FIXED on `task_date` (past days, done or missed), ADHOC on the day it was completed. Calendar (`?month=YYYY-MM`): FIXED on `task_date`, ADHOC on its deadline (or completion day if it had none).
- Both pages filter by `assignee_id = me.id` explicitly (RLS alone shows admins everyone's tasks).
- Change log: `getTaskTimeline()` reads `task_history`; actors are shown as Bạn / Hệ thống / Quản lý (employees can't read other profiles).
- Team name: `getTeamName()` in `@/lib/settings` (`system_settings.team_name`), passed to the shell via `ShellUser.teamName`. Notification preferences are stored only — no sender job yet.

## Admin dashboard (Phase 7)
- `src/app/(app)/(admin)/overview/`: a Server Component driven by the URL — `?range=today|7d|week|month|custom` (+ `from`/`to`), `?member=<id>` opens that member's sheet. Parse with `resolveRange()`, build links with `overviewHref()`.
- "Which tasks count for a date range" is defined once in SQL: `private.task_in_range(tasks, from, to)`. `public.team_overview(from, to)` (per-member counts) and `public.tasks_in_range(assignee, from, to)` (the rows behind a card) both use it — never re-implement the rule in TS. FIXED: `task_date` in range. ADHOC: due in range, or completed in range, or open + already late when the range covers today. Open ad-hoc without a deadline never counts.
- Both RPCs are `security invoker`: RLS applies (employees calling them only get their own rows).
- Live updates: `OverviewRealtime` subscribes to `tasks` and calls a debounced `router.refresh()` (plus a 60s tick so overdue stays current). No client-side copy of the numbers.
- Tailwind merge gotcha: `cn("text-display", "text-success")` drops `text-display` (custom font-size utilities are treated as colours). Put the colour on an inner element.

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
- `npm run test:db` — pgTAP tests in `supabase/tests/` (schema, generation, idempotency, history, ad-hoc rules)
- `npm run test:e2e` — browser auth flow via installed Edge (app must be running; set `E2E_BASE_URL`)
- Seed accounts (local only, password `Password123!`): `admin@team.local`, `an@team.local`, `binh@team.local`
