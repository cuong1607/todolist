-- Phase 4: Fixed Task templates + daily task generation.
--
-- fixed_task_templates  — admin-managed definition ("what each employee must do on which weekdays")
-- tasks                 — concrete per-day task instances; FIXED rows are generated from templates
--                         (ADHOC rows will share this table in a later phase)

-- ============================================================
-- App timezone. One place to change if the team moves.
-- ============================================================
create or replace function private.app_timezone()
returns text
language sql
immutable
set search_path = ''
as $$ select 'Asia/Bangkok' $$;

create or replace function private.today_local()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone private.app_timezone())::date $$;

grant execute on function private.app_timezone() to authenticated;
grant execute on function private.today_local() to authenticated;

-- ============================================================
-- Enums
-- ============================================================
create type public.task_type as enum ('FIXED', 'ADHOC');
create type public.task_status as enum ('TODO', 'DONE');

-- ============================================================
-- Fixed task templates
-- ============================================================
create table public.fixed_task_templates (
  id uuid primary key default gen_random_uuid(),
  assignee_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  note text check (char_length(note) <= 2000),
  allow_employee_note boolean not null default false,
  -- Local (Asia/Bangkok) time of day the task is due. Null = due any time today.
  due_time time,
  -- ISO weekdays the task applies to: 1 = Monday … 7 = Sunday.
  weekdays smallint[] not null default '{1,2,3,4,5}'
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fixed_task_templates_assignee_idx on public.fixed_task_templates (assignee_id, sort_order);

create trigger set_updated_at
  before update on public.fixed_task_templates
  for each row execute function private.set_updated_at();

-- ============================================================
-- Tasks (daily instances)
-- ============================================================
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  type public.task_type not null,
  assignee_id uuid not null references public.profiles (id) on delete cascade,
  -- RESTRICT: a template that has generated tasks can never be hard-deleted (disable it instead).
  template_id uuid references public.fixed_task_templates (id) on delete restrict,
  task_date date not null,
  -- Snapshots taken at generation time; later template edits never rewrite history.
  title text not null check (char_length(trim(title)) between 1 and 200),
  note text,
  allow_employee_note boolean not null default false,
  due_at timestamptz,
  sort_order integer not null default 0,
  -- Written by the assignee (only when allow_employee_note).
  employee_note text check (char_length(employee_note) <= 1000),
  status public.task_status not null default 'TODO',
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One instance per template per day: the generator relies on this to be idempotent.
  constraint tasks_template_date_key unique (template_id, task_date),
  constraint tasks_fixed_has_template check ((type = 'FIXED') = (template_id is not null)),
  constraint tasks_completion_consistent check ((status = 'DONE') = (completed_at is not null))
);

create index tasks_assignee_date_idx on public.tasks (assignee_id, task_date);
create index tasks_date_idx on public.tasks (task_date);

create trigger set_updated_at
  before update on public.tasks
  for each row execute function private.set_updated_at();

-- ============================================================
-- Client update rules for tasks.
-- Clients may change only `status` and `employee_note`; everything else
-- (deadline, date, title, assignee, template…) is locked. Completion
-- metadata is stamped here, never trusted from the client.
-- ============================================================
create or replace function private.guard_task_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  is_admin boolean := private.is_admin();
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.id <> old.id
    or new.type <> old.type
    or new.assignee_id <> old.assignee_id
    or new.template_id is distinct from old.template_id
    or new.task_date <> old.task_date
    or new.title <> old.title
    or new.note is distinct from old.note
    or new.allow_employee_note <> old.allow_employee_note
    or new.due_at is distinct from old.due_at
    or new.sort_order <> old.sort_order
    or new.completed_at is distinct from old.completed_at
    or new.completed_by is distinct from old.completed_by
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at
  then
    raise exception 'Không được phép sửa trường này' using errcode = '42501';
  end if;

  -- Employees work on today's tasks only; past days are history.
  if not is_admin and old.task_date <> private.today_local() then
    raise exception 'Chỉ cập nhật được công việc của hôm nay' using errcode = '42501';
  end if;

  if new.employee_note is distinct from old.employee_note then
    if old.assignee_id <> (select auth.uid()) or not old.allow_employee_note then
      raise exception 'Công việc này không cho phép ghi chú' using errcode = '42501';
    end if;
  end if;

  if new.status <> old.status then
    if new.status = 'DONE' then
      new.completed_at := now();
      new.completed_by := (select auth.uid());
    else
      new.completed_at := null;
      new.completed_by := null;
    end if;
  end if;

  return new;
end;
$$;

grant execute on function private.guard_task_update() to authenticated;

create trigger guard_task_update
  before update on public.tasks
  for each row execute function private.guard_task_update();

-- ============================================================
-- RLS
-- ============================================================
alter table public.fixed_task_templates enable row level security;
alter table public.tasks enable row level security;

revoke all on public.fixed_task_templates from anon;
revoke all on public.tasks from anon;
revoke insert, delete, truncate on public.tasks from authenticated;

-- Templates: admin only. Employees see the generated tasks, not the templates.
create policy "templates: admin reads"
  on public.fixed_task_templates for select to authenticated
  using ((select private.is_admin()));

create policy "templates: admin inserts"
  on public.fixed_task_templates for insert to authenticated
  with check ((select private.is_admin()));

create policy "templates: admin updates"
  on public.fixed_task_templates for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Hard delete only succeeds for templates that never generated a task (FK RESTRICT).
create policy "templates: admin deletes"
  on public.fixed_task_templates for delete to authenticated
  using ((select private.is_admin()));

-- Tasks: own tasks (active members) or everything for admin.
create policy "tasks: read own or admin reads all"
  on public.tasks for select to authenticated
  using (
    (assignee_id = (select auth.uid()) and (select private.is_active_user()))
    or (select private.is_admin())
  );

create policy "tasks: update own or admin updates all"
  on public.tasks for update to authenticated
  using (
    (assignee_id = (select auth.uid()) and (select private.is_active_user()))
    or (select private.is_admin())
  )
  with check (
    (assignee_id = (select auth.uid()) and (select private.is_active_user()))
    or (select private.is_admin())
  );

-- No insert/delete policies: FIXED tasks come only from the generator and are never deleted.

-- ============================================================
-- Generator — idempotent. Safe to run any number of times for the same day.
-- ============================================================
create or replace function private.generate_fixed_tasks(p_date date default private.today_local())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.tasks (
    type, assignee_id, template_id, task_date,
    title, note, allow_employee_note, due_at, sort_order
  )
  select
    'FIXED', t.assignee_id, t.id, p_date,
    t.title, t.note, t.allow_employee_note,
    case when t.due_time is null then null
         else (p_date + t.due_time) at time zone private.app_timezone() end,
    t.sort_order
  from public.fixed_task_templates t
  join public.profiles p on p.id = t.assignee_id
  where t.active
    and p.active
    and extract(isodow from p_date)::smallint = any (t.weekdays)
  on conflict (template_id, task_date) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Admin-callable: fill in today's tasks right after creating/enabling a template,
-- instead of waiting for tomorrow's run. Today only — never back-fills history.
create or replace function public.ensure_today_fixed_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Chỉ admin' using errcode = '42501';
  end if;
  return private.generate_fixed_tasks(private.today_local());
end;
$$;

revoke execute on function public.ensure_today_fixed_tasks() from public, anon;
grant execute on function public.ensure_today_fixed_tasks() to authenticated;

-- Atomic reorder of one assignee's templates. SECURITY INVOKER: RLS applies (admin only).
create or replace function public.reorder_fixed_task_templates(p_assignee_id uuid, p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.fixed_task_templates t
  set sort_order = o.ord
  from unnest(p_ids) with ordinality as o(id, ord)
  where t.id = o.id and t.assignee_id = p_assignee_id;
$$;

revoke execute on function public.reorder_fixed_task_templates(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_fixed_task_templates(uuid, uuid[]) to authenticated;

-- ============================================================
-- Schedule: 00:05 Asia/Bangkok = 17:05 UTC (pg_cron runs in UTC; Bangkok has no DST).
-- ============================================================
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'generate-fixed-tasks',
  '5 17 * * *',
  $$ select private.generate_fixed_tasks(); $$
);

-- ============================================================
-- Health check version bump
-- ============================================================
create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261003020000_fixed_tasks',
    'server_time', now()
  );
$$;
