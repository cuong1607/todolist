-- Phase 3: lock the core schema.
--   * align column names with the spec (default_note, days_of_week, fixed_template_id,
--     deadline_at, completed)
--   * template effective dates; task_date nullable for ADHOC
--   * new tables: task_history, notification_settings, notification_logs, system_settings
--   * indexes + RLS for all of the above
--
-- Function bodies are plain text and are NOT updated by column renames, so every
-- function touching renamed columns is recreated below.

-- ============================================================
-- fixed_task_templates
-- ============================================================
alter table public.fixed_task_templates rename column note to default_note;
alter table public.fixed_task_templates rename column weekdays to days_of_week;

alter table public.fixed_task_templates
  add column effective_from date not null default private.today_local(),
  add column effective_to date,
  add constraint fixed_task_templates_effective_range check (effective_to is null or effective_to >= effective_from);

comment on column public.fixed_task_templates.days_of_week is 'ISO weekdays: 1 = Monday … 7 = Sunday';
comment on column public.fixed_task_templates.effective_from is 'First local date the template generates tasks';
comment on column public.fixed_task_templates.effective_to is 'Last local date (inclusive); null = open-ended';

-- ============================================================
-- tasks
-- ============================================================
alter table public.tasks rename column template_id to fixed_template_id;
alter table public.tasks rename column due_at to deadline_at;
alter table public.tasks rename constraint tasks_template_date_key to tasks_fixed_template_date_key;

-- status (TODO/DONE) → completed boolean
alter table public.tasks add column completed boolean not null default false;
update public.tasks set completed = (status = 'DONE');
alter table public.tasks drop constraint tasks_completion_consistent;
drop index if exists public.tasks_open_adhoc_idx;
alter table public.tasks drop column status;
drop type public.task_status;
alter table public.tasks
  add constraint tasks_completion_consistent check (completed = (completed_at is not null));

-- task_date: the instance date for FIXED; null for ADHOC (not day-bound — created_at records creation).
alter table public.tasks alter column task_date drop not null;
alter table public.tasks alter column task_date drop default;
update public.tasks set task_date = null where type = 'ADHOC';
alter table public.tasks
  add constraint tasks_task_date_matches_type check ((type = 'FIXED') = (task_date is not null));

comment on column public.tasks.task_date is 'FIXED: the day this instance belongs to. ADHOC: null.';
comment on column public.tasks.deadline_at is 'Optional deadline. FIXED: snapshot of template due_time on task_date.';
comment on column public.tasks.completed is 'The only stored state. UPCOMING/TODAY/OVERDUE/COMPLETED is derived by display_status().';

-- ============================================================
-- Indexes
-- ============================================================
-- Existing: tasks (assignee_id, task_date), tasks (task_date), unique (fixed_template_id, task_date),
--           fixed_task_templates (assignee_id, sort_order)
create index tasks_deadline_at_idx on public.tasks (deadline_at) where deadline_at is not null;
create index tasks_completed_idx on public.tasks (completed);
create index tasks_type_idx on public.tasks (type);
-- Hot path for the Today screen: a member's unfinished ad-hoc tasks.
create index tasks_open_adhoc_idx on public.tasks (assignee_id) where type = 'ADHOC' and not completed;

-- ============================================================
-- Generator (recreated for renamed columns + effective dates)
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
    type, assignee_id, fixed_template_id, task_date,
    title, note, allow_employee_note, deadline_at, sort_order, created_by
  )
  select
    'FIXED', t.assignee_id, t.id, p_date,
    t.title, t.default_note, t.allow_employee_note,
    case when t.due_time is null then null
         else (p_date + t.due_time) at time zone private.app_timezone() end,
    t.sort_order, null
  from public.fixed_task_templates t
  join public.profiles p on p.id = t.assignee_id
  where t.active
    and p.active
    and extract(isodow from p_date)::smallint = any (t.days_of_week)
    and p_date >= t.effective_from
    and (t.effective_to is null or p_date <= t.effective_to)
  on conflict (fixed_template_id, task_date) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- ============================================================
-- Insert guard (recreated: completed instead of status, task_date null for ADHOC)
-- ============================================================
create or replace function private.guard_task_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.type <> 'ADHOC' or new.fixed_template_id is not null then
    raise exception 'Chỉ được tạo công việc phát sinh' using errcode = '42501';
  end if;
  if new.assignee_id is distinct from uid then
    raise exception 'Chỉ được tạo công việc cho chính mình' using errcode = '42501';
  end if;
  if new.completed then
    raise exception 'Công việc mới phải ở trạng thái chưa xong' using errcode = '42501';
  end if;

  -- Server-controlled fields: overwrite whatever the client sent.
  new.task_date := null;
  new.created_by := uid;
  new.completed_at := null;
  new.completed_by := null;
  new.allow_employee_note := false;
  new.employee_note := null;
  new.sort_order := 0;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop policy "tasks: members create own adhoc" on public.tasks;
create policy "tasks: members create own adhoc"
  on public.tasks for insert to authenticated
  with check (
    type = 'ADHOC'
    and fixed_template_id is null
    and task_date is null
    and assignee_id = (select auth.uid())
    and (select private.is_active_user())
  );

-- ============================================================
-- Update guard (recreated for renamed columns)
-- ============================================================
create or replace function private.guard_task_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  is_admin boolean := private.is_admin();
  is_owner boolean := old.assignee_id = (select auth.uid());
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- Never editable by clients.
  if new.id <> old.id
    or new.type <> old.type
    or new.assignee_id <> old.assignee_id
    or new.fixed_template_id is distinct from old.fixed_template_id
    or new.task_date is distinct from old.task_date
    or new.allow_employee_note <> old.allow_employee_note
    or new.sort_order <> old.sort_order
    or new.completed_at is distinct from old.completed_at
    or new.completed_by is distinct from old.completed_by
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at
  then
    raise exception 'Không được phép sửa trường này' using errcode = '42501';
  end if;

  if old.type = 'FIXED' then
    if new.title <> old.title
      or new.note is distinct from old.note
      or new.deadline_at is distinct from old.deadline_at
    then
      raise exception 'Không được sửa nội dung hoặc hạn của việc cố định' using errcode = '42501';
    end if;

    if not is_admin and old.task_date <> private.today_local() then
      raise exception 'Chỉ cập nhật được công việc của hôm nay' using errcode = '42501';
    end if;

    if new.employee_note is distinct from old.employee_note
      and (not is_owner or not old.allow_employee_note)
    then
      raise exception 'Công việc này không cho phép ghi chú' using errcode = '42501';
    end if;
  else
    if (new.title <> old.title
        or new.note is distinct from old.note
        or new.deadline_at is distinct from old.deadline_at)
      and not is_owner
    then
      raise exception 'Chỉ người tạo được sửa công việc phát sinh' using errcode = '42501';
    end if;

    if new.employee_note is distinct from old.employee_note then
      raise exception 'Không được phép sửa trường này' using errcode = '42501';
    end if;
  end if;

  if new.completed <> old.completed then
    if new.completed then
      new.completed_at := now();
      new.completed_by := uid;
    else
      new.completed_at := null;
      new.completed_by := null;
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================
-- Derived display status (recreated for renamed columns)
-- ============================================================
create or replace function public.display_status(t public.tasks)
returns public.task_display_status
language sql
stable
set search_path = ''
as $$
  select case
    when t.completed then 'COMPLETED'
    -- A fixed task belongs to its day: missed yesterday = overdue, even without a deadline.
    when t.type = 'FIXED' and t.task_date < private.today_local() then 'OVERDUE'
    when t.deadline_at is not null and t.deadline_at < now() then 'OVERDUE'
    -- No deadline: never overdue, always actionable ("việc đang tồn").
    when t.deadline_at is null then 'TODAY'
    when (t.deadline_at at time zone private.app_timezone())::date <= private.today_local() then 'TODAY'
    else 'UPCOMING'
  end::public.task_display_status;
$$;

-- ============================================================
-- task_history — append-only audit log, written ONLY by trigger.
-- ============================================================
create type public.task_action as enum ('CREATED', 'UPDATED', 'RESCHEDULED', 'COMPLETED', 'REOPENED');

create table public.task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  -- null = system (e.g. the daily generator)
  actor_id uuid references public.profiles (id) on delete set null,
  action public.task_action not null,
  -- Only the fields that changed (full row for CREATED).
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index task_history_task_idx on public.task_history (task_id, created_at);
create index task_history_actor_idx on public.task_history (actor_id, created_at);

create or replace function private.log_task_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_j jsonb;
  new_j jsonb;
  changed_old jsonb;
  changed_new jsonb;
  act public.task_action;
begin
  if tg_op = 'INSERT' then
    insert into public.task_history (task_id, actor_id, action, new_data)
    values (new.id, (select auth.uid()), 'CREATED', to_jsonb(new) - 'updated_at');
    return new;
  end if;

  old_j := to_jsonb(old) - 'updated_at';
  new_j := to_jsonb(new) - 'updated_at';

  select jsonb_object_agg(n.key, o.value), jsonb_object_agg(n.key, n.value)
  into changed_old, changed_new
  from jsonb_each(new_j) n
  join jsonb_each(old_j) o using (key)
  where n.value is distinct from o.value;

  if changed_new is null then
    return new; -- no-op update
  end if;

  act := case
    when changed_new ? 'completed' and new.completed then 'COMPLETED'
    when changed_new ? 'completed' then 'REOPENED'
    when changed_new ? 'deadline_at' then 'RESCHEDULED'
    else 'UPDATED'
  end;

  insert into public.task_history (task_id, actor_id, action, old_data, new_data)
  values (new.id, (select auth.uid()), act, changed_old, changed_new);
  return new;
end;
$$;

create trigger log_task_change
  after insert or update on public.tasks
  for each row execute function private.log_task_change();

alter table public.task_history enable row level security;
revoke all on public.task_history from anon;
revoke insert, update, delete, truncate on public.task_history from authenticated;

create policy "task_history: own tasks or admin"
  on public.task_history for select to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1 from public.tasks t
      where t.id = task_history.task_id
        and t.assignee_id = (select auth.uid())
    )
  );

-- ============================================================
-- notification_settings — per-member preferences (1:1 with profiles).
-- profiles.notification_enabled remains the master switch.
-- ============================================================
create table public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  daily_summary_enabled boolean not null default true,
  -- Local (Asia/Bangkok) time for the morning "việc hôm nay" summary.
  daily_summary_time time not null default '08:00',
  deadline_reminder_enabled boolean not null default true,
  remind_before_minutes integer not null default 30 check (remind_before_minutes between 5 and 1440),
  overdue_alert_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.notification_settings
  for each row execute function private.set_updated_at();

-- Every profile gets a settings row.
create or replace function private.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_profile_created
  after insert on public.profiles
  for each row execute function private.handle_new_profile();

insert into public.notification_settings (user_id)
select id from public.profiles
on conflict do nothing;

alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from anon;
revoke insert, delete, truncate on public.notification_settings from authenticated;

create policy "notification_settings: read own or admin"
  on public.notification_settings for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "notification_settings: update own"
  on public.notification_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ============================================================
-- notification_logs — every notification attempt. Written by server jobs only.
-- ============================================================
create type public.notification_channel as enum ('ZALO', 'IN_APP');
create type public.notification_status as enum ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

create table public.notification_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  channel public.notification_channel not null,
  -- e.g. DAILY_SUMMARY, DEADLINE_REMINDER, OVERDUE_ALERT
  kind text not null check (kind ~ '^[A-Z][A-Z0-9_]*$'),
  status public.notification_status not null default 'PENDING',
  -- Idempotency: senders set e.g. 'DEADLINE_REMINDER:<task_id>:<deadline>' so retries never double-send.
  dedupe_key text unique,
  payload jsonb,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index notification_logs_user_idx on public.notification_logs (user_id, created_at desc);
create index notification_logs_task_idx on public.notification_logs (task_id) where task_id is not null;
create index notification_logs_status_idx on public.notification_logs (status) where status in ('PENDING', 'FAILED');

alter table public.notification_logs enable row level security;
revoke all on public.notification_logs from anon;
revoke insert, update, delete, truncate on public.notification_logs from authenticated;

create policy "notification_logs: read own or admin"
  on public.notification_logs for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- ============================================================
-- system_settings — team-wide key/value config. Members read, admins write.
-- ============================================================
create table public.system_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function private.stamp_system_setting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

grant execute on function private.stamp_system_setting() to authenticated;

create trigger stamp_system_setting
  before insert or update on public.system_settings
  for each row execute function private.stamp_system_setting();

alter table public.system_settings enable row level security;
revoke all on public.system_settings from anon;

create policy "system_settings: members read"
  on public.system_settings for select to authenticated
  using ((select private.is_active_user()));

create policy "system_settings: admin inserts"
  on public.system_settings for insert to authenticated
  with check ((select private.is_admin()));

create policy "system_settings: admin updates"
  on public.system_settings for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "system_settings: admin deletes"
  on public.system_settings for delete to authenticated
  using ((select private.is_admin()));

insert into public.system_settings (key, value, description) values
  ('team_name', '"Team Todo"', 'Tên hiển thị của team');

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
    'schema_version', '20261003040000_core_schema',
    'server_time', now()
  );
$$;
