-- Phase 13: the end-of-day summary, as specified.
--   * One time for the whole team, set by an admin (system_settings.end_of_day_summary_time).
--     The default moves from 17:30 (Phase 9) to 18:00; members keep their on/off switch.
--   * One message per member per day with that member's own numbers, at the moment it is built:
--       Cố định: xong 3, chưa xong 1
--       Phát sinh: xong hôm nay 2, đang tồn 4, quá hạn 1
--     FIXED  done     today's fixed tasks that are completed
--            missed   today's fixed tasks that are not ("chưa xong": the day is not over yet)
--     ADHOC  done     completed today (by completed_at, local date)
--            open     every unfinished ad-hoc task (outstanding)
--            late     … of those, with a deadline that has already passed (overdue)
--     The ad-hoc definitions match the reporting migration (overdue is a subset of outstanding).
--   * It is a snapshot, nothing more: no task is locked or changed. Members can still complete
--     work afterwards and completed_at is stamped with the real time; the message already sent is
--     not rewritten and no second one goes out (key end-of-day-summary:<user>:<date>).
--
-- Delivery is unchanged: the row goes to notification_logs, IN_APP is delivered in the database and
-- ZALO by the worker (Phase 10).

-- Only where the old default is still in place; a time an admin picked is left alone.
update public.system_settings
set value = '"18:00"'
where key = 'end_of_day_summary_time' and value = '"17:30"';

-- What one member's end-of-day summary says at p_now.
-- Kept as its own function so the numbers can be tested (and reused) without the scheduler.
create or replace function private.end_of_day_counts(p_user_id uuid, p_today date, p_now timestamptz default now())
returns table (fixed_done integer, fixed_missed integer, adhoc_done integer, adhoc_open integer, adhoc_late integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (count(*) filter (where t.type = 'FIXED' and t.task_date = p_today and t.completed))::integer,
    (count(*) filter (where t.type = 'FIXED' and t.task_date = p_today and not t.completed))::integer,
    (count(*) filter (where t.type = 'ADHOC' and t.completed
      and (t.completed_at at time zone private.app_timezone())::date = p_today))::integer,
    (count(*) filter (where t.type = 'ADHOC' and not t.completed))::integer,
    (count(*) filter (where t.type = 'ADHOC' and not t.completed and t.deadline_at < p_now))::integer
  from public.tasks t
  where t.assignee_id = p_user_id;
$$;

create or replace function private.schedule_end_of_day_summaries(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := private.app_timezone();
  local_now timestamp := p_now at time zone private.app_timezone();
  today date := (p_now at time zone private.app_timezone())::date;
  send_time time := private.setting_time('end_of_day_summary_time', '18:00');
  n integer;
begin
  -- Still worth sending up to two hours late (e.g. the job was down); after that it is stale.
  if local_now < today + send_time or local_now >= today + send_time + interval '2 hours' then
    return 0;
  end if;

  select coalesce(sum(private.enqueue_notification(
    p.id, null, 'END_OF_DAY_SUMMARY',
    -- One per member per day: changing the time later the same day cannot send a second one.
    'end-of-day-summary:' || p.id || ':' || today,
    (today + send_time) at time zone tz,
    jsonb_build_object(
      'title', 'Tổng kết hôm nay',
      'body', 'Cố định: xong ' || c.fixed_done || ', chưa xong ' || c.fixed_missed || E'\n'
        || 'Phát sinh: xong hôm nay ' || c.adhoc_done || ', đang tồn ' || c.adhoc_open || ', quá hạn ' || c.adhoc_late,
      'url', '/today')
  )), 0) into n
  from public.profiles p
  join public.notification_settings s on s.user_id = p.id
  cross join lateral private.end_of_day_counts(p.id, today, p_now) c
  where p.active and p.notification_enabled and s.end_of_day_summary_enabled
    -- Nothing happened and nothing is waiting → no message.
    and c.fixed_done + c.fixed_missed + c.adhoc_done + c.adhoc_open > 0;

  return n;
end;
$$;

-- The scheduler, with the end-of-day summary moved out into the function above. Everything else is as in Phase 12.
create or replace function private.schedule_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := private.app_timezone();
  local_now timestamp := p_now at time zone private.app_timezone();
  today date := (p_now at time zone private.app_timezone())::date;
  -- A summary is still worth sending this long after its time (e.g. the job was down); later it is stale.
  summary_window constant interval := interval '2 hours';
  admin_time time := private.setting_time('admin_daily_summary_time', '18:00');
  n integer;
  total integer := 0;
begin
  -- MORNING_SUMMARY — one message per member at the team's morning time.
  total := total + private.schedule_morning_summaries(p_now);

  -- DEADLINE_REMINDER — the team's lead time ahead of a timed ad-hoc deadline.
  total := total + private.schedule_deadline_reminders(p_now);

  -- OVERDUE_REMINDER — once per task per deadline, only while it is fresh (not for old backlog
  -- on the day the engine is switched on).
  select coalesce(sum(private.enqueue_notification(
    t.assignee_id, t.id, 'OVERDUE_REMINDER',
    'overdue-reminder:' || t.id || ':' || extract(epoch from t.deadline_at)::bigint,
    t.deadline_at,
    jsonb_build_object(
      'title', 'Việc quá hạn',
      'body', '“' || t.title || '” đã quá hạn lúc ' || to_char(t.deadline_at at time zone tz, 'HH24:MI DD/MM') || '.',
      'url', '/today')
  )), 0) into n
  from public.tasks t
  join public.profiles p on p.id = t.assignee_id
  join public.notification_settings s on s.user_id = p.id
  where not t.completed
    and t.deadline_at <= p_now
    and t.deadline_at > p_now - interval '24 hours'
    and p.active and p.notification_enabled and s.overdue_alert_enabled;
  total := total + n;

  -- END_OF_DAY_SUMMARY — one message per member at the team's end-of-day time.
  total := total + private.schedule_end_of_day_summaries(p_now);

  -- ADMIN_DAILY_SUMMARY — the team's day for every admin.
  if local_now >= today + admin_time and local_now < today + admin_time + summary_window then
    select coalesce(sum(private.enqueue_notification(
      a.id, null, 'ADMIN_DAILY_SUMMARY',
      'admin-daily-summary:' || a.id || ':' || today,
      (today + admin_time) at time zone tz,
      jsonb_build_object(
        'title', 'Tổng kết team',
        'body', 'Team hôm nay: xong ' || team.done_n || '/' || team.total_n || ' việc'
          || case when team.late_n > 0 then ', ' || team.late_n || ' quá hạn' else '' end
          || case when team.people_left > 0 then ', ' || team.people_left || ' người còn việc.' else '. Cả team đã xong!' end,
        'url', '/overview')
    )), 0) into n
    from (
      select
        count(*) as total_n,
        count(*) filter (where t.completed) as done_n,
        count(*) filter (where not t.completed and t.deadline_at < p_now) as late_n,
        count(distinct t.assignee_id) filter (where not t.completed) as people_left
      from public.tasks t
      join public.profiles m on m.id = t.assignee_id and m.active
      where private.task_in_range(t, today, today)
    ) team
    join public.profiles a on a.role = 'ADMIN' and a.active and a.notification_enabled
    where team.total_n > 0;
    total := total + n;
  end if;

  return total;
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
    'schema_version', '20261007085322_end_of_day_summary',
    'server_time', now()
  );
$$;
