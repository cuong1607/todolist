-- Phase 11: the morning summary, as specified.
--   * One time for the whole team, set by an admin (system_settings.morning_summary_time, default 08:00).
--     Replaces the per-member time from Phase 9 (notification_settings.daily_summary_time, dropped below);
--     members keep their on/off switch (daily_summary_enabled).
--   * One message per member per day — never one per task — with three numbers, each on its own line:
--       Công việc hôm nay
--       Cố định: 4
--       Đến hạn hôm nay: 2
--       Quá hạn: 1
--   * Every number is counted from that member's own tasks only.
--
-- Delivery is unchanged: the row goes to notification_logs, IN_APP is delivered in the database and
-- ZALO by the worker (Phase 10).

insert into public.system_settings (key, value, description) values
  ('morning_summary_time', '"08:00"', 'Giờ gửi tóm tắt công việc buổi sáng cho từng thành viên (HH:MM)')
on conflict (key) do nothing;

-- What one member's morning summary says. Only unfinished work counts:
--   fixed  today's fixed tasks
--   due    ad-hoc tasks whose deadline is today
--   late   ad-hoc tasks whose deadline was before today
-- Kept as its own function so the numbers can be tested (and reused) without the scheduler.
create or replace function private.morning_summary_counts(p_user_id uuid, p_today date)
returns table (fixed_n integer, due_n integer, late_n integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (count(*) filter (where t.type = 'FIXED' and t.task_date = p_today))::integer,
    (count(*) filter (where t.type = 'ADHOC' and (t.deadline_at at time zone private.app_timezone())::date = p_today))::integer,
    (count(*) filter (where t.type = 'ADHOC' and (t.deadline_at at time zone private.app_timezone())::date < p_today))::integer
  from public.tasks t
  where t.assignee_id = p_user_id and not t.completed;
$$;

create or replace function private.schedule_morning_summaries(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := private.app_timezone();
  local_now timestamp := p_now at time zone private.app_timezone();
  today date := (p_now at time zone private.app_timezone())::date;
  send_time time := private.setting_time('morning_summary_time', '08:00');
  n integer;
begin
  -- Still worth sending up to two hours late (e.g. the job was down); after that it is stale.
  if local_now < today + send_time or local_now >= today + send_time + interval '2 hours' then
    return 0;
  end if;

  select coalesce(sum(private.enqueue_notification(
    p.id, null, 'MORNING_SUMMARY',
    -- One per member per day: changing the time later the same day cannot send a second one.
    'morning-summary:' || p.id || ':' || today,
    (today + send_time) at time zone tz,
    jsonb_build_object(
      'title', 'Công việc hôm nay',
      'body', 'Cố định: ' || c.fixed_n || E'\n' || 'Đến hạn hôm nay: ' || c.due_n || E'\n' || 'Quá hạn: ' || c.late_n,
      'url', '/today')
  )), 0) into n
  from public.profiles p
  join public.notification_settings s on s.user_id = p.id
  cross join lateral private.morning_summary_counts(p.id, today) c
  where p.active and p.notification_enabled and s.daily_summary_enabled
    -- Nothing to do today → no message.
    and c.fixed_n + c.due_n + c.late_n > 0;

  return n;
end;
$$;

-- The scheduler, with the morning summary moved out into the function above. Everything else is as in Phase 9.
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
  eod_time time := private.setting_time('end_of_day_summary_time', '17:30');
  admin_time time := private.setting_time('admin_daily_summary_time', '18:00');
  n integer;
  total integer := 0;
begin
  -- MORNING_SUMMARY — one message per member at the team's morning time.
  total := total + private.schedule_morning_summaries(p_now);

  -- DEADLINE_REMINDER — "remind_before_minutes" ahead of a timed deadline.
  -- Date-only deadlines (23:59) are left to the morning summary: a 23:29 ping helps nobody.
  -- The deadline is part of the key, so a rescheduled task is reminded again.
  select coalesce(sum(private.enqueue_notification(
    t.assignee_id, t.id, 'DEADLINE_REMINDER',
    'deadline-reminder:' || t.id || ':' || extract(epoch from t.deadline_at)::bigint,
    t.deadline_at - make_interval(mins => s.remind_before_minutes),
    jsonb_build_object(
      'title', 'Sắp đến hạn',
      'body', '“' || t.title || '” đến hạn lúc ' || to_char(t.deadline_at at time zone tz, 'HH24:MI') || '.',
      'url', '/today')
  )), 0) into n
  from public.tasks t
  join public.profiles p on p.id = t.assignee_id
  join public.notification_settings s on s.user_id = p.id
  where not t.completed
    and t.deadline_at > p_now
    and t.deadline_at - make_interval(mins => s.remind_before_minutes) <= p_now
    and (t.deadline_at at time zone tz)::time <> time '23:59'
    and p.active and p.notification_enabled and s.deadline_reminder_enabled;
  total := total + n;

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

  -- END_OF_DAY_SUMMARY — each member's day, counted exactly like the admin dashboard.
  if local_now >= today + eod_time and local_now < today + eod_time + summary_window then
    select coalesce(sum(private.enqueue_notification(
      c.user_id, null, 'END_OF_DAY_SUMMARY',
      'end-of-day-summary:' || c.user_id || ':' || today,
      (today + eod_time) at time zone tz,
      jsonb_build_object(
        'title', 'Tổng kết ngày',
        'body', 'Hôm nay bạn đã xong ' || c.done_n || '/' || c.total_n || ' việc.'
          || case when c.total_n > c.done_n then ' Còn ' || (c.total_n - c.done_n) || ' việc chưa xong.' else ' Tuyệt vời!' end,
        'url', '/today')
    )), 0) into n
    from (
      select p.id as user_id, count(*) as total_n, count(*) filter (where t.completed) as done_n
      from public.profiles p
      join public.notification_settings s on s.user_id = p.id
      join public.tasks t on t.assignee_id = p.id and private.task_in_range(t, today, today)
      where p.active and p.notification_enabled and s.end_of_day_summary_enabled
      group by p.id
    ) c;
    total := total + n;
  end if;

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

-- The per-member time is gone; nothing reads it any more.
alter table public.notification_settings drop column daily_summary_time;

create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261005021833_morning_summary',
    'server_time', now()
  );
$$;
