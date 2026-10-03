-- Phase 5: Ad-hoc tasks (employees create their own, carry over across days).
--
-- ADHOC rows live in public.tasks next to FIXED ones:
--   due_at      = optional deadline (spec: deadline_at)
--   task_date   = local date the task was created (record only; ad-hoc tasks are NOT day-bound)
--   note        = the employee's own note (employee_note is for FIXED tasks only)
-- Only "completed or not" is stored (status + completed_at). UPCOMING / TODAY / OVERDUE /
-- COMPLETED is derived — see public.display_status() and src/lib/task-status.ts.

alter table public.tasks
  add constraint tasks_note_length check (char_length(note) <= 2000);

-- Column defaults below call private.*; server-side jobs (service_role) must be able to use them too.
grant usage on schema private to service_role;
grant execute on function private.today_local(), private.app_timezone() to service_role;

-- Clients don't send these; the insert guard below enforces them anyway.
alter table public.tasks
  alter column assignee_id set default auth.uid(),
  alter column task_date set default private.today_local(),
  alter column created_by set default auth.uid();

-- ============================================================
-- Insert guard: employees may only create ADHOC tasks for themselves.
-- Runs before RLS WITH CHECK, so it can reject with a clear message.
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

  if new.type <> 'ADHOC' or new.template_id is not null then
    raise exception 'Chỉ được tạo công việc phát sinh' using errcode = '42501';
  end if;
  if new.assignee_id is distinct from uid then
    raise exception 'Chỉ được tạo công việc cho chính mình' using errcode = '42501';
  end if;
  if new.status <> 'TODO' then
    raise exception 'Công việc mới phải ở trạng thái chưa xong' using errcode = '42501';
  end if;

  -- Server-controlled fields: overwrite whatever the client sent.
  new.task_date := private.today_local();
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

grant execute on function private.guard_task_insert() to authenticated;

create trigger guard_task_insert
  before insert on public.tasks
  for each row execute function private.guard_task_insert();

grant insert on public.tasks to authenticated;

create policy "tasks: members create own adhoc"
  on public.tasks for insert to authenticated
  with check (
    type = 'ADHOC'
    and template_id is null
    and assignee_id = (select auth.uid())
    and (select private.is_active_user())
  );

-- ============================================================
-- Update guard (replaces the Phase 4 version).
--   FIXED: only status + employee_note (if allowed); employees only on today's task.
--   ADHOC: the assignee may also edit title, note, due_at (reschedule) — on any day,
--          because unfinished ad-hoc tasks carry over.
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
    or new.template_id is distinct from old.template_id
    or new.task_date <> old.task_date
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
      or new.due_at is distinct from old.due_at
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
        or new.due_at is distinct from old.due_at)
      and not is_owner
    then
      raise exception 'Chỉ người tạo được sửa công việc phát sinh' using errcode = '42501';
    end if;

    if new.employee_note is distinct from old.employee_note then
      raise exception 'Không được phép sửa trường này' using errcode = '42501';
    end if;
  end if;

  if new.status <> old.status then
    if new.status = 'DONE' then
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
-- Derived display status. Exposed as a computed column:
--   select id, display_status from tasks   (PostgREST computed field)
-- Keep in sync with deriveStatus() in src/lib/task-status.ts.
-- ============================================================
create type public.task_display_status as enum ('UPCOMING', 'TODAY', 'OVERDUE', 'COMPLETED');

create or replace function public.display_status(t public.tasks)
returns public.task_display_status
language sql
stable
set search_path = ''
as $$
  select case
    when t.status = 'DONE' then 'COMPLETED'
    -- A fixed task belongs to its day: missed yesterday = overdue, even without a deadline.
    when t.type = 'FIXED' and t.task_date < private.today_local() then 'OVERDUE'
    when t.due_at is not null and t.due_at < now() then 'OVERDUE'
    -- No deadline: never overdue, always actionable ("việc đang tồn").
    when t.due_at is null then 'TODAY'
    when (t.due_at at time zone private.app_timezone())::date <= private.today_local() then 'TODAY'
    else 'UPCOMING'
  end::public.task_display_status;
$$;

grant execute on function public.display_status(public.tasks) to authenticated;

create index tasks_open_adhoc_idx on public.tasks (assignee_id) where type = 'ADHOC' and status = 'TODO';

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
    'schema_version', '20261003030000_adhoc_tasks',
    'server_time', now()
  );
$$;
