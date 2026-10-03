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
- Supabase: `@/lib/supabase/client` in Client Components, `@/lib/supabase/server` on the server. Never use the service-role key in Next.js code.
- Authorization is enforced by RLS in Postgres; UI checks are convenience only.
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
