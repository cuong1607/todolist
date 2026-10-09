-- Update 3 (2/2): task_history says who a task was given to and who it moved between.
--
--   TASK_ASSIGNED             an ad-hoc task created for someone else (instead of CREATED;
--                             new_data is the full row, as for CREATED)
--   TASK_TRANSFERRED          the assignee or the creator moved it (old/new_data = assignee_id)
--   TASK_REASSIGNED_BY_ADMIN  an admin moved a task that was not on their own list
--
-- Still written only by this trigger; public.transfer_task() just updates the row.

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
    act := case
      when new.type = 'ADHOC' and new.created_by is not null and new.created_by <> new.assignee_id then 'TASK_ASSIGNED'
      else 'CREATED'
    end;
    insert into public.task_history (task_id, actor_id, action, new_data)
    values (new.id, (select auth.uid()), act, to_jsonb(new) - 'updated_at');
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
    when changed_new ? 'assignee_id' and private.is_admin() and old.assignee_id is distinct from (select auth.uid())
      then 'TASK_REASSIGNED_BY_ADMIN'
    when changed_new ? 'assignee_id' then 'TASK_TRANSFERRED'
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

create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261009081457_task_assignment_history',
    'server_time', now()
  );
$$;
