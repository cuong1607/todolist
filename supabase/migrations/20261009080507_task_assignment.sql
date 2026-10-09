-- Update 1: an ad-hoc task can be created for another member.
--
--   created_by   who created the task (always the session user; never changes)
--   assignee_id  who is responsible for it now
--
-- Both columns already exist. What changes:
--   * the insert guard + policy accept another ACTIVE member as assignee (ADHOC only)
--   * the creator can still read a task they handed to someone else (needed for the row the
--     insert returns, and for the "Đã giao" list). Reading is all the creator gets: UPDATE stays
--     with the assignee and admins.
--   * public.team_members(): names for the "Giao cho" picker — employees cannot read other profiles.
-- FIXED tasks are untouched: they still come only from private.generate_fixed_tasks().

-- ============================================================
-- Members a task can be handed to
-- ============================================================
-- SECURITY DEFINER: employees have no access to other members' profiles.
create or replace function private.is_active_member(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user_id and active);
$$;

grant execute on function private.is_active_member(uuid) to authenticated;

-- Id + display name only (no email, role or Zalo data), for active callers. Inactive members are
-- included with their flag so "Giao bởi" can still name them; pickers show the active ones.
create or replace function public.team_members()
returns table (id uuid, full_name text, active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)), p.active
  from public.profiles p
  where (select private.is_active_user())
  order by 2;
$$;

revoke execute on function public.team_members() from public, anon;
grant execute on function public.team_members() to authenticated;

-- ============================================================
-- Insert guard: ADHOC for yourself (default) or for another active member
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
  if new.assignee_id is distinct from uid and not private.is_active_member(new.assignee_id) then
    raise exception 'Người nhận không tồn tại hoặc đã ngừng hoạt động' using errcode = '42501';
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
create policy "tasks: members create adhoc"
  on public.tasks for insert to authenticated
  with check (
    type = 'ADHOC'
    and fixed_template_id is null
    and task_date is null
    and (select private.is_active_user())
    and (assignee_id = (select auth.uid()) or private.is_active_member(assignee_id))
  );

-- ============================================================
-- Read: your own tasks + ad-hoc tasks you created for someone else
-- ============================================================
drop policy "tasks: read own or admin reads all" on public.tasks;
create policy "tasks: read own, created, or admin reads all"
  on public.tasks for select to authenticated
  using (
    (
      (assignee_id = (select auth.uid()) or (type = 'ADHOC' and created_by = (select auth.uid())))
      and (select private.is_active_user())
    )
    or (select private.is_admin())
  );

-- "Đã giao": the tasks a member created.
create index tasks_created_by_idx on public.tasks (created_by) where type = 'ADHOC';

create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261009080507_task_assignment',
    'server_time', now()
  );
$$;
