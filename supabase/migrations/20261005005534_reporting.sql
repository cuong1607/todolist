-- Phase 8: reporting. Aggregation happens here, never in the frontend.
--
-- Definitions for a range [p_from, p_to] of local dates (inclusive):
--   FIXED  expected   instances whose task_date is in the range
--          completed  … of those, done
--          missed     … of those, not done and the day is over (today's open ones are still pending)
--   ADHOC  created    created in the range
--          completed  completed in the range
--          on_time    … of those, finished by the deadline (no deadline = on time)
--          outstanding  open at the end of the range (created before it ended, not finished by then)
--          overdue      … of those, with a deadline that had already passed
-- "The end of the range" is capped at now(), so a range that runs into the future reports the present.
-- Outstanding/overdue for past ranges are reconstructed from created_at/completed_at; a task that was
-- completed, then reopened later, counts as open for the whole time (the first completion is not kept).
--
-- SECURITY INVOKER: RLS applies — admins get the team, an employee only their own numbers.

create or replace function private.day_start(p_day date)
returns timestamptz
language sql
stable
set search_path = ''
as $$ select p_day::timestamp at time zone private.app_timezone() $$;

grant execute on function private.day_start(date) to authenticated;

-- Per-member totals for the range.
create or replace function public.report_summary(p_from date, p_to date)
returns table (
  assignee_id uuid,
  fixed_expected integer,
  fixed_completed integer,
  fixed_missed integer,
  adhoc_created integer,
  adhoc_completed integer,
  adhoc_on_time integer,
  adhoc_outstanding integer,
  adhoc_overdue integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select
      private.day_start(p_from) as range_start,
      private.day_start(p_to + 1) as range_end,
      least(private.day_start(p_to + 1), now()) as cutoff
  ),
  fixed as (
    select
      t.assignee_id,
      count(*) as expected,
      count(*) filter (where t.completed) as completed,
      count(*) filter (where not t.completed and t.task_date < private.today_local()) as missed
    from public.tasks t
    where t.type = 'FIXED' and t.task_date between p_from and p_to
    group by t.assignee_id
  ),
  adhoc as (
    select
      t.assignee_id,
      count(*) filter (where t.created_at >= b.range_start and t.created_at < b.range_end) as created,
      count(*) filter (where t.completed_at >= b.range_start and t.completed_at < b.range_end) as completed,
      count(*) filter (
        where t.completed_at >= b.range_start and t.completed_at < b.range_end
          and (t.deadline_at is null or t.completed_at <= t.deadline_at)
      ) as on_time,
      count(*) filter (
        where t.created_at < b.cutoff and (t.completed_at is null or t.completed_at >= b.cutoff)
      ) as outstanding,
      count(*) filter (
        where t.created_at < b.cutoff and (t.completed_at is null or t.completed_at >= b.cutoff)
          and t.deadline_at < b.cutoff
      ) as overdue
    from public.tasks t
    cross join bounds b
    where t.type = 'ADHOC'
    group by t.assignee_id
  )
  select
    coalesce(f.assignee_id, a.assignee_id),
    coalesce(f.expected, 0)::integer,
    coalesce(f.completed, 0)::integer,
    coalesce(f.missed, 0)::integer,
    coalesce(a.created, 0)::integer,
    coalesce(a.completed, 0)::integer,
    coalesce(a.on_time, 0)::integer,
    coalesce(a.outstanding, 0)::integer,
    coalesce(a.overdue, 0)::integer
  from fixed f
  full join adhoc a on a.assignee_id = f.assignee_id;
$$;

revoke execute on function public.report_summary(date, date) from public, anon;
grant execute on function public.report_summary(date, date) to authenticated;

-- One row per day (team-wide) for the trend charts. Days after today are left out.
-- adhoc_overdue is a snapshot: ad-hoc tasks that were open and past their deadline at the end of that day.
create or replace function public.report_daily(p_from date, p_to date)
returns table (
  day date,
  fixed_expected integer,
  fixed_completed integer,
  fixed_missed integer,
  adhoc_created integer,
  adhoc_completed integer,
  adhoc_overdue integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.day,
    f.expected::integer,
    f.completed::integer,
    f.missed::integer,
    a.created::integer,
    a.completed::integer,
    a.overdue::integer
  from (
    select
      g::date as day,
      private.day_start(g::date) as day_start,
      private.day_start(g::date + 1) as day_end,
      least(private.day_start(g::date + 1), now()) as cutoff
    from generate_series(p_from::timestamp, least(p_to, private.today_local())::timestamp, interval '1 day') g
  ) d
  cross join lateral (
    select
      count(*) as expected,
      count(*) filter (where t.completed) as completed,
      count(*) filter (where not t.completed and t.task_date < private.today_local()) as missed
    from public.tasks t
    where t.type = 'FIXED' and t.task_date = d.day
  ) f
  cross join lateral (
    select
      count(*) filter (where t.created_at >= d.day_start and t.created_at < d.day_end) as created,
      count(*) filter (where t.completed_at >= d.day_start and t.completed_at < d.day_end) as completed,
      count(*) filter (
        where t.created_at < d.cutoff and (t.completed_at is null or t.completed_at >= d.cutoff)
          and t.deadline_at < d.cutoff
      ) as overdue
    from public.tasks t
    where t.type = 'ADHOC'
  ) a
  order by d.day;
$$;

revoke execute on function public.report_daily(date, date) from public, anon;
grant execute on function public.report_daily(date, date) to authenticated;

create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261005005534_reporting',
    'server_time', now()
  );
$$;
