-- Update 2: hand an ad-hoc task over to another member.
--
-- public.transfer_task(task, new assignee) is the ONLY way assignee_id changes. Clients still
-- cannot update the column themselves: private.guard_task_update() rejects it for every
-- authenticated caller, admins included. The function changes assignee_id and nothing else —
-- created_by, deadline_at, note and the history written so far stay as they are, so a task that
-- was overdue is still overdue for whoever receives it.
--
-- Who may transfer:
--   the current assignee   their own task
--   the creator            a task they handed out (e.g. to the wrong person)
--   an admin               any ad-hoc task
-- Rules: ADHOC only; not completed (reopen it first); the receiver is an active member and is not
-- already the assignee.

create or replace function public.transfer_task(p_task_id uuid, p_new_assignee_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t public.tasks;
begin
  if uid is null or not private.is_active_user() then
    raise exception 'Cần đăng nhập' using errcode = '42501';
  end if;

  -- Lock the row: two transfers of the same task run one after the other.
  select * into t from public.tasks where id = p_task_id for update;

  -- A task the caller has nothing to do with looks exactly like one that does not exist.
  if not found
    or not (private.is_admin() or t.assignee_id = uid or (t.type = 'ADHOC' and t.created_by = uid))
  then
    raise exception 'Không tìm thấy công việc' using errcode = '42501';
  end if;
  if t.type <> 'ADHOC' then
    raise exception 'Việc cố định không thể chuyển cho người khác' using errcode = '42501';
  end if;
  if t.completed then
    raise exception 'Việc đã xong — mở lại trước khi chuyển' using errcode = '42501';
  end if;
  if p_new_assignee_id is null or not private.is_active_member(p_new_assignee_id) then
    raise exception 'Người nhận không tồn tại hoặc đã ngừng hoạt động' using errcode = '42501';
  end if;
  if p_new_assignee_id = t.assignee_id then
    raise exception 'Người này đang phụ trách công việc' using errcode = '42501';
  end if;

  -- The log_task_change trigger records who moved it, from whom, to whom.
  update public.tasks set assignee_id = p_new_assignee_id where id = p_task_id returning * into t;
  return t;
end;
$$;

revoke execute on function public.transfer_task(uuid, uuid) from public, anon;
grant execute on function public.transfer_task(uuid, uuid) to authenticated;

-- ============================================================
-- History follows the task: whoever may read the task may read its log
-- (assignee, creator of an ad-hoc task, admin).
-- ============================================================
drop policy "task_history: own tasks or admin" on public.task_history;
create policy "task_history: own or created tasks, or admin"
  on public.task_history for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.is_active_user())
      and exists (
        select 1 from public.tasks t
        where t.id = task_history.task_id
          and (t.assignee_id = (select auth.uid()) or (t.type = 'ADHOC' and t.created_by = (select auth.uid())))
      )
    )
  );

create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261009081102_task_transfer',
    'server_time', now()
  );
$$;
