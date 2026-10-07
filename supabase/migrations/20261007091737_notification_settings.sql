-- Phase 15: notification settings — admins control the schedule, and every scheduler reads it
-- from ONE place.
--
--   private.notification_schedule()   the team's schedule with its defaults. This is the only
--                                     place a default time lives; the schedulers below and the
--                                     app (through public.notification_schedule()) read it.
--
--   setting (system_settings key)     default        spec name
--   morning_summary_time              08:00          morning_summary_time
--   end_of_day_summary_time           18:00          end_of_day_time
--   admin_daily_summary_enabled       true           —
--   admin_daily_summary_time          18:10          admin_summary_time
--   deadline_reminder_minutes         60 (0 = off)   deadline_reminder_minutes
--   zalo_enabled                      false          zalo_notifications_enabled (read by private.zalo_enabled())
--   timezone                          Asia/Bangkok   not a row: private.app_timezone(), see below
--
-- The existing key names are kept (they are already in use on the cloud database).
-- The timezone is reported here but is not an editable setting: task_date, the 00:05 fixed-task
-- job and the app (APP_TIMEZONE) are all built on one fixed zone, and changing it under existing
-- data would move tasks to other days.
-- A missing or malformed value falls back to its default, so a bad write can never stop the job.

-- The reminder default moves from 30 (Phase 12) to 60. Only where the old default is still in place.
update public.system_settings
set value = '60'
where key = 'deadline_reminder_minutes' and value = '30';

create or replace function private.notification_schedule()
returns table (
  timezone text,
  morning_summary_time time,
  end_of_day_summary_time time,
  admin_daily_summary_enabled boolean,
  admin_daily_summary_time time,
  deadline_reminder_minutes integer
)
language sql
stable
set search_path = ''
as $$
  select
    private.app_timezone(),
    private.setting_time('morning_summary_time', '08:00'),
    private.setting_time('end_of_day_summary_time', '18:00'),
    private.setting_bool('admin_daily_summary_enabled', true),
    private.setting_time('admin_daily_summary_time', '18:10'),
    coalesce(
      (select (s.value #>> '{}')::integer
       from public.system_settings s
       where s.key = 'deadline_reminder_minutes' and s.value #>> '{}' in ('0', '30', '60', '120')),
      60
    );
$$;

-- The same schedule for the app (times as HH:MM). SECURITY INVOKER: it shows what the caller may
-- read in system_settings anyway.
create or replace function public.notification_schedule()
returns table (
  timezone text,
  morning_summary_time text,
  end_of_day_summary_time text,
  admin_daily_summary_enabled boolean,
  admin_daily_summary_time text,
  deadline_reminder_minutes integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.timezone,
    to_char(s.morning_summary_time, 'HH24:MI'),
    to_char(s.end_of_day_summary_time, 'HH24:MI'),
    s.admin_daily_summary_enabled,
    to_char(s.admin_daily_summary_time, 'HH24:MI'),
    s.deadline_reminder_minutes
  from private.notification_schedule() s;
$$;

grant execute on function private.setting_time(text, time), private.setting_bool(text, boolean), private.notification_schedule() to authenticated, service_role;
revoke execute on function public.notification_schedule() from public, anon;
grant execute on function public.notification_schedule() to authenticated, service_role;

-- ============================================================
-- The schedulers, reading the schedule instead of carrying their own defaults.
-- Their rules are unchanged (see the Phase 11–14 migrations).
-- ============================================================
create or replace function private.schedule_morning_summaries(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg record;
  local_now timestamp;
  today date;
  n integer;
begin
  select * into cfg from private.notification_schedule();
  local_now := p_now at time zone cfg.timezone;
  today := local_now::date;

  -- Still worth sending up to two hours late (e.g. the job was down); after that it is stale.
  if local_now < today + cfg.morning_summary_time or local_now >= today + cfg.morning_summary_time + interval '2 hours' then
    return 0;
  end if;

  select coalesce(sum(private.enqueue_notification(
    p.id, null, 'MORNING_SUMMARY',
    -- One per member per day: changing the time later the same day cannot send a second one.
    'morning-summary:' || p.id || ':' || today,
    (today + cfg.morning_summary_time) at time zone cfg.timezone,
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

create or replace function private.schedule_deadline_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg record;
  lead interval;
  queued integer;
begin
  select * into cfg from private.notification_schedule();
  lead := make_interval(mins => cfg.deadline_reminder_minutes);

  -- Queued but not sent yet, and no longer true: the task was completed, its deadline moved,
  -- or the admin switched reminders off.
  delete from public.notification_logs l
  using public.tasks t
  where l.type = 'DEADLINE_REMINDER' and l.status = 'PENDING' and t.id = l.task_id
    and (cfg.deadline_reminder_minutes = 0 or t.completed
      or l.dedupe_key is distinct from private.deadline_reminder_key(t.id, t.deadline_at));

  if cfg.deadline_reminder_minutes = 0 then
    return 0;
  end if;

  select coalesce(sum(private.enqueue_notification(
    t.assignee_id, t.id, 'DEADLINE_REMINDER',
    private.deadline_reminder_key(t.id, t.deadline_at),
    t.deadline_at - lead,
    jsonb_build_object(
      'title', 'Sắp đến hạn',
      'body', '“' || t.title || '” đến hạn lúc ' || to_char(t.deadline_at at time zone cfg.timezone, 'HH24:MI') || '.',
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
    and (t.deadline_at at time zone cfg.timezone)::time <> time '23:59'
    and p.active and p.notification_enabled and s.deadline_reminder_enabled;

  return queued;
end;
$$;

-- Replaced by private.notification_schedule().
drop function private.deadline_reminder_minutes();

create or replace function private.schedule_end_of_day_summaries(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg record;
  local_now timestamp;
  today date;
  n integer;
begin
  select * into cfg from private.notification_schedule();
  local_now := p_now at time zone cfg.timezone;
  today := local_now::date;

  -- Still worth sending up to two hours late (e.g. the job was down); after that it is stale.
  if local_now < today + cfg.end_of_day_summary_time or local_now >= today + cfg.end_of_day_summary_time + interval '2 hours' then
    return 0;
  end if;

  select coalesce(sum(private.enqueue_notification(
    p.id, null, 'END_OF_DAY_SUMMARY',
    -- One per member per day: changing the time later the same day cannot send a second one.
    'end-of-day-summary:' || p.id || ':' || today,
    (today + cfg.end_of_day_summary_time) at time zone cfg.timezone,
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

create or replace function private.schedule_admin_daily_summaries(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg record;
  local_now timestamp;
  today date;
  body text;
  n integer;
begin
  select * into cfg from private.notification_schedule();
  local_now := p_now at time zone cfg.timezone;
  today := local_now::date;

  if not cfg.admin_daily_summary_enabled then
    return 0;
  end if;
  -- Still worth sending up to two hours late (e.g. the job was down); after that it is stale.
  if local_now < today + cfg.admin_daily_summary_time or local_now >= today + cfg.admin_daily_summary_time + interval '2 hours' then
    return 0;
  end if;

  body := private.admin_daily_summary_body(today, p_now);
  if body is null then
    return 0;
  end if;

  select coalesce(sum(private.enqueue_notification(
    a.id, null, 'ADMIN_DAILY_SUMMARY',
    -- One per admin per day: changing the time later the same day cannot send a second one.
    'admin-daily-summary:' || a.id || ':' || today,
    (today + cfg.admin_daily_summary_time) at time zone cfg.timezone,
    jsonb_build_object('title', 'Tổng kết team hôm nay', 'body', body, 'url', '/overview')
  )), 0) into n
  from public.profiles a
  where a.role = 'ADMIN' and a.active and a.notification_enabled;

  return n;
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
    'schema_version', '20261007091737_notification_settings',
    'server_time', now()
  );
$$;
