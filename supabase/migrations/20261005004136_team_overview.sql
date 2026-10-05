-- Phase 7: admin dashboard.
-- One definition of "which tasks count for a date range", shared by the per-member
-- aggregates (team_overview) and the per-member task list (tasks_in_range), so the
-- numbers on a card always match the list behind it.
--
-- Both functions are SECURITY INVOKER: RLS still applies, so an admin gets the whole
-- team and an employee calling them by hand only ever gets their own rows.

-- A task counts for [p_from, p_to] (local dates, inclusive) when:
--   FIXED: it is that day's instance.
--   ADHOC: it is due in the range, or was finished in the range, or — when the range
--          covers today — it is still open and already late (carried over).
--   Open ad-hoc tasks without a deadline ("việc đang tồn") never count: they are not
--   owed on any particular day. This mirrors the Today screen's progress bar.
create or replace function private.task_in_range(t public.tasks, p_from date, p_to date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when t.type = 'FIXED' then t.task_date between p_from and p_to
    else
      (t.deadline_at is not null
        and (t.deadline_at at time zone private.app_timezone())::date between p_from and p_to)
      or (t.completed
        and (t.completed_at at time zone private.app_timezone())::date between p_from and p_to)
      or (not t.completed
        and t.deadline_at is not null
        and (t.deadline_at at time zone private.app_timezone())::date < p_from
        and private.today_local() between p_from and p_to)
  end;
$$;

grant execute on function private.task_in_range(public.tasks, date, date) to authenticated;

-- Per-member counts for the dashboard cards. Members without tasks in range return no row.
create or replace function public.team_overview(p_from date, p_to date)
returns table (
  assignee_id uuid,
  fixed_total integer,
  fixed_done integer,
  adhoc_total integer,
  adhoc_done integer,
  overdue integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.assignee_id,
    (count(*) filter (where t.type = 'FIXED'))::integer,
    (count(*) filter (where t.type = 'FIXED' and t.completed))::integer,
    (count(*) filter (where t.type = 'ADHOC'))::integer,
    (count(*) filter (where t.type = 'ADHOC' and t.completed))::integer,
    (count(*) filter (where public.display_status(t) = 'OVERDUE'))::integer
  from public.tasks t
  where private.task_in_range(t, p_from, p_to)
  group by t.assignee_id;
$$;

revoke execute on function public.team_overview(date, date) from public, anon;
grant execute on function public.team_overview(date, date) to authenticated;

-- The rows behind one member's card.
create or replace function public.tasks_in_range(p_assignee_id uuid, p_from date, p_to date)
returns setof public.tasks
language sql
stable
security invoker
set search_path = ''
as $$
  select t.*
  from public.tasks t
  where t.assignee_id = p_assignee_id
    and private.task_in_range(t, p_from, p_to);
$$;

revoke execute on function public.tasks_in_range(uuid, date, date) from public, anon;
grant execute on function public.tasks_in_range(uuid, date, date) to authenticated;

create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261005004136_team_overview',
    'server_time', now()
  );
$$;
