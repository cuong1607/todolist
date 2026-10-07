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
- `notification_settings` row per profile (auto-created); `profiles.notification_enabled` is the master switch. `notification_logs` are written by the notification engine only (see below). `system_settings`: members read, admins write.
- Timezone: `private.app_timezone()` in SQL and `APP_TIMEZONE` in `@/lib/time` — keep in sync. Use `todayLocal()` for `task_date` in the app.

## Today screen (Phase 6)
- `src/app/(app)/today/`: `TodayView` owns task state client-side — optimistic ticks, merges of rows returned by actions, Supabase Realtime (`tasks` is in the `supabase_realtime` publication). Today actions return the row (`TODAY_TASK_COLUMNS`) and do NOT `revalidatePath` — ticking never re-renders the page.
- Realtime: call `supabase.realtime.setAuth(token)` before `subscribe()`, otherwise RLS evaluates as anon and no events arrive. Ignore echoes for ids in flight.
- Sections (spec order): Cố định → Đến hạn hôm nay → Quá hạn → Việc đang tồn → Sắp tới (collapsed) → Đã xong (collapsed). Fixed tasks stay in their section when done; completed ad-hoc cards settle 700ms before moving.
- Cards stay minimal (checkbox · title · deadline · 1-line note); details/edit/notes open in a sheet. Interaction animations 150–250ms.
- `Dialog` renders as a bottom sheet below `sm`. From `sm`: `<DialogContent variant="sheet">` (side sheet) for anything you read or edit about an existing task/member; the default centered dialog only for short create forms and confirmations. `Fab` adds its own bottom spacer; use `extended` for the screen's primary action.
- Optimistic UI (Phase 16): complete, reopen, create, edit, reschedule and notes all change the list first and call the server after (`toggle` / `saveAdhoc` / `saveNote` in `TodayView`); a failure rolls back and toasts with "Thử lại". The dialogs only collect input — they never await the server. A created row has a `temp-…` id until confirmed (`pending`: not tickable); Realtime INSERTs are held back while a create is in flight so the card is not duplicated.

## UX rules (Phase 16)
- Loading: every page segment has a `loading.tsx` skeleton (`@/components/page-skeleton`) — no full-screen spinners. Put `loading.tsx` BELOW the layout that gates access (`(app)/(admin)/loading.tsx`, never `(app)/loading.tsx`): a redirect thrown inside a streaming boundary becomes a client-side redirect instead of an HTTP one.
- A `<Link>` that only changes search params (range chips, member cards) keeps the page on screen, so no skeleton shows: put `<LinkPending>` inside it for a local pending state.
- With skeletons the URL changes before the content arrives — browser tests must wait for content, not for the URL.
- Colour: red only for something actually overdue or an error, and only on the number/label/badge — never a red card border or background. Destructive button style only for destructive actions (delete, disconnect), not for sign-out.
- Durations: fast 120ms, normal 200ms, slow 280ms (`--duration-*`, `@/lib/motion`); nothing above 300ms.

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

## Reporting (Phase 8)
- `src/app/(app)/(admin)/reports/`: URL-driven Server Component — `?period=day|week|month` (+ `date` anchor) or `?period=custom&from=&to=`. Parse with `resolvePeriod()`, link with `reportHref()`.
- All aggregation is in SQL: `public.report_summary(from, to)` (per member) and `public.report_daily(from, to)` (per day, team-wide, stops at today). Never pull raw tasks to compute metrics in TS. Metric definitions are documented at the top of the `reporting` migration — change them there, with `supabase/tests/reporting.test.sql`.
- No combined performance score. The headline is "Tỷ lệ hoàn thành công việc" = fixed completed / expected; show "—" (not 0%) when nothing was expected.
- Charts: `TrendChart` (hand-rolled SVG, single series, one y-axis). Marks take the hue via `currentColor`; text stays in text tokens. Every charted value must also be in the daily table.

## Notification engine (Phase 9)
- Flow: task state → `private.schedule_notifications(p_now)` → `notification_logs` (queue + audit) → provider. pg_cron job `notification-tick` runs `private.notification_tick()` every minute (release stuck → schedule → deliver in-app).
- The scheduler only decides WHAT is due; it enqueues through `private.enqueue_notification()`, which writes one row per provider the member is reachable on (IN_APP always; ZALO when `profiles.zalo_connected`). Idempotent via `unique (provider, dedupe_key)` — every new notification type needs a deterministic key (`<type>:<user|task>:<date|deadline epoch>`).
- Providers never touch the table directly: `claim_notifications(provider, limit)` → send → `complete_notification(id, external_id)` or `fail_notification(id, error)` (retry after 1 and 5 min, third failure = FAILED). Service role only. IN_APP is delivered inside the DB by `private.deliver_in_app()`.
- Status: PENDING → PROCESSING → SENT | FAILED. Payload is `{ title, body, url? }` in Vietnamese, built in SQL; read it with `readPayload()` (`@/lib/notifications`), which only allows in-app URLs.
- Rules live in the migration headers + `supabase/tests/notification_engine.test.sql` / `morning_summary.test.sql` (tests pin the clock via `p_now`). Members only switch types on/off.
- Schedule (Phase 15): `private.notification_schedule()` is the ONLY place a notification time or default lives (`morning_summary_time` 08:00, `end_of_day_summary_time` 18:00, `admin_daily_summary_enabled` true, `admin_daily_summary_time` 18:10, `deadline_reminder_minutes` 60, plus the fixed timezone). Every `private.schedule_*` function reads it; the app reads the same thing through the `notification_schedule()` RPC (`getNotificationSchedule()` in `@/lib/settings`). Never hard-code a time or a default in a scheduler or in TS. Malformed/missing values fall back to the defaults. Admins edit it on `/settings`. Tests: `supabase/tests/notification_settings.test.sql`.
- Timezone is not an editable setting (`private.app_timezone()` is immutable; `task_date` and the fixed-task cron depend on it); it is only shown on `/settings`.
- Admin daily summary (Phase 14): `private.schedule_admin_daily_summaries()` — ONE message per admin per day, body from `private.admin_daily_summary_body(date, now)` (team line + `name done/total` per member, counted with `private.task_in_range`). Per-task notifications always go to the assignee only, never to admins. Tests: `supabase/tests/admin_daily_summary.test.sql`.
- Morning summary (Phase 11): `private.schedule_morning_summaries()` — ONE message per member per day with three counts from `private.morning_summary_counts(user, date)` (unfinished only: fixed today / ad-hoc due today / ad-hoc overdue). Never one notification per task. Multi-line bodies are rendered with `whitespace-pre-line`.
- End-of-day summary (Phase 13): `private.schedule_end_of_day_summaries()` — ONE message per member per day with five counts from `private.end_of_day_counts(user, date, now)` (fixed done / not done; ad-hoc done today / open / overdue). It is a snapshot only: never lock or change tasks at that time. Tests: `supabase/tests/end_of_day_summary.test.sql`.
- Deadline reminder (Phase 12): `private.schedule_deadline_reminders()` — ADHOC only, not completed, timed deadline (date-only = 23:59 is skipped), key `deadline-reminder:<task>:<deadline epoch>` so a moved deadline is reminded again. Lead time is team-wide: `system_settings.deadline_reminder_minutes` = 0 (off) | 30 | 60 | 120 (default 60); the options are duplicated in `DEADLINE_REMINDER_OPTIONS` (`@/lib/notifications`) — keep in sync. It also deletes PENDING reminders whose task was completed or rescheduled. Tests: `supabase/tests/deadline_reminder.test.sql`.
- UI: inbox `/notifications` (own IN_APP rows, bell in the header), admin log `/settings/notifications`.
- The cron tick also runs locally, so `notification_logs` fills up on its own after `db:reset`; tests must not assume it is empty.

## Zalo OA (Phase 10)
Setup guide for a real OA: [docs/ZALO.md](docs/ZALO.md).
- Secrets: `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_OA_SECRET_KEY`, `APP_URL`, `CRON_SECRET` are server env only — read them through `getZaloConfig()` (`@/lib/zalo/config`, returns null when unset: the app must keep working without Zalo). The rotating OA tokens live in Supabase Vault behind service-role RPCs (`zalo_get_tokens` / `zalo_save_tokens`); never put them in env, `system_settings`, or anything a browser can read. `system_settings` holds only `zalo_enabled`, `zalo_oa_id`, `zalo_oa_name`.
- Provider: `sendNotification(user, payload)` in `@/lib/zalo/provider` is the only way to send. It throws `ZaloError` (`kind`, `retryable`, `zaloCode`); callers pass `p_final: !retryable` to `fail_notification`. Unknown Zalo error codes are treated as final.
- `@/lib/supabase/service` (service role) is for server jobs without a user session — the worker, the webhook, the token store — and only for service-role RPCs plus the minimum they need. User-triggered work still goes through `@/lib/supabase/server`.
- Routes: `/api/zalo/oauth/start|callback` (admin, PKCE + state cookie), `/api/zalo/webhook` (public; verified by `X-ZEvent-Signature` against the raw body), `/api/cron/zalo-dispatch` (public; `Authorization: Bearer CRON_SECRET`). The last two are in `PUBLIC_PATHS` in `@/lib/supabase/proxy` and must authenticate themselves.
- Linking: `zalo_create_link_code()` (member) → member sends the code to the OA → webhook calls `zalo_link_by_code()`. Clients can never write `zalo_user_id` themselves. `zalo_unlink()` for self / admin.
- Trigger: `private.notification_tick()` ends with `private.trigger_zalo_dispatch()`, which POSTs to the worker via pg_net only when ZALO rows are due. The URL + secret are registered in Vault by the OAuth callback.
- Domain verification: `ZALO_SITE_VERIFICATION` renders `<meta name="zalo-platform-site-verification">` from the root layout. `/` is public and renders the sign-in screen with a 200 for signed-out visitors (`LoginScreen`) — do not turn it back into a redirect, or Zalo's crawler will not see the tag.
- Not yet verified against a live OA: the webhook signature formula and the "tin tư vấn" delivery window. Endpoints were checked against a third-party SDK, not Zalo's own docs.
- `npm run test:zalo` — full flow against `scripts/mock-zalo.mjs` (needs the app started with the env listed at the top of `scripts/test-zalo.mjs`).

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
- `npm run test:ux` — UX checks with a slowed network: skeletons, optimistic create/edit/note, side sheets (same setup as `test:e2e`; run each on a fresh `db:reset`)
- Seed accounts (local only, password `Password123!`): `admin@team.local`, `an@team.local`, `binh@team.local`, plus `admin@admin.com` (ADMIN) and `cuong@nhanvien.com` — the same emails exist in production with different passwords. The repo is public: never put production passwords in `seed.sql`.
