-- Phase 12: the deadline reminder, as specified.
--   * One lead time for the whole team, set by an admin: system_settings.deadline_reminder_minutes
--     = 0 (off) | 30 | 60 | 120, default 30. Replaces the per-member lead time from Phase 9
--     (notification_settings.remind_before_minutes, dropped below); members keep their on/off
--     switch (deadline_reminder_enabled).
--   * A task is reminded only when ALL of these hold:
--       type = ADHOC                    fixed tasks are covered by the morning summary
--       not completed
--       its deadline has a time         date-only deadlines are stored as 23:59 local and skipped
--       the deadline is still ahead     and no more than the lead time away
--       not reminded for this deadline  key deadline-reminder:<task>:<deadline epoch>
--   * The deadline is part of the key: moving it makes the task due for a reminder again, at the
--     new time. Changing the lead time does not re-send a reminder that already went out.
--   * No job per task: the per-minute notification tick looks for tasks coming due.
--   * A reminder that is queued but not sent yet (a Zalo retry) is dropped as soon as its task is
--     completed or rescheduled, so nothing stale goes out.
--
-- Delivery is unchanged: the row goes to notification_logs, IN_APP is delivered in the database and
-- ZALO by the worker (Phase 10).

insert into public.system_settings (key, value, description) values
  ('deadline_reminder_minutes', '30', 'Nhắc việc phát sinh trước deadline bao nhiêu phút (0 = tắt, 30, 60, 120)')
on conflict (key) do nothing;

-- The team's lead time in minutes; 0 = off. Anything missing or outside the options falls back to the default.
create or replace function private.deadline_reminder_minutes()
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::integer
     from public.system_settings s
     where s.key = 'deadline_reminder_minutes' and s.value #>> '{}' in ('0', '30', '60', '120')),
    30
  );
$$;

create or replace function private.deadline_reminder_key(p_task_id uuid, p_deadline_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'deadline-reminder:' || p_task_id || ':' || extract(epoch from p_deadline_at)::bigint;
$$;

create or replace function private.schedule_deadline_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := private.app_timezone();
  lead_minutes integer := private.deadline_reminder_minutes();
  lead interval := make_interval(mins => lead_minutes);
  queued integer;
begin
  -- Queued but not sent yet, and no longer true: the task was completed, its deadline moved,
  -- or the admin switched reminders off.
  delete from public.notification_logs l
  using public.tasks t
  where l.type = 'DEADLINE_REMINDER' and l.status = 'PENDING' and t.id = l.task_id
    and (lead_minutes = 0 or t.completed
      or l.dedupe_key is distinct from private.deadline_reminder_key(t.id, t.deadline_at));

  if lead_minutes = 0 then
    return 0;
  end if;

  select coalesce(sum(private.enqueue_notification(
    t.assignee_id, t.id, 'DEADLINE_REMINDER',
    private.deadline_reminder_key(t.id, t.deadline_at),
    t.deadline_at - lead,
    jsonb_build_object(
      'title', 'Sắp đến hạn',
      'body', '“' || t.title || '” đến hạn lúc ' || to_char(t.deadline_at at time zone tz, 'HH24:MI') || '.',
      'url', '/today')
  )), 0) into queued
  from public.tasks t
  join public.profiles p on p.id = t.assignee_id
  join public.notification_settings s on s.user_id = p.id
  where t.type = 'ADHOC'
    and not t.completed
    and t.deadline_at > p_now
    and t.deadline_at - lead <= p_now
    -- Date-only deadlines are left to the morning summary: a 23:29 ping helps nobody.
    and (t.deadline_at at time zone tz)::time <> time '23:59'
    and p.active and p.notification_enabled and s.deadline_reminder_enabled;

  return queued;
end;
$$;

-- The scheduler, with the deadline reminder moved out into the function above. Everything else is as in Phase 11.
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

-- The per-member lead time is gone; nothing reads it any more.
alter table public.notification_settings drop column remind_before_minutes;

create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261007075322_deadline_reminder',
    'server_time', now()
  );
$$;
