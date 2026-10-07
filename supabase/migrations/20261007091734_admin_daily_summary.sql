-- Phase 14: the admin's daily summary, as specified.
--   * Admins get ONE short message a day about the whole team — never the members' personal
--     notifications (those are always addressed to the task's assignee only).
--   * Team settings, set by an admin:
--       system_settings.admin_daily_summary_enabled   on/off, default on
--       system_settings.admin_daily_summary_time      default 18:10 — ten minutes after the
--                                                     members' end-of-day summary (18:00)
--   * Content, counted exactly like the dashboard (private.task_in_range for today):
--       Tổng 11 · Xong 10 · Còn 1 · Quá hạn 1
--       Nguyễn Văn An 6/6
--       Trần Thị Bình 4/5
--     total / completed / outstanding (= total − completed) / overdue (open, deadline passed),
--     then one line per active member who has work today: completed/total.
--   * No work today → no message. Key admin-daily-summary:<admin>:<date>: one per admin per day.

insert into public.system_settings (key, value, description) values
  ('admin_daily_summary_enabled', 'true', 'Gửi tổng kết team hằng ngày cho admin (true/false)')
on conflict (key) do nothing;

-- Only where the old default is still in place; a time an admin picked is left alone.
update public.system_settings
set value = '"18:10"'
where key = 'admin_daily_summary_time' and value = '"18:00"';

-- A system_settings value as a boolean; anything missing or malformed falls back to the default.
create or replace function private.setting_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::boolean
     from public.system_settings s
     where s.key = p_key and jsonb_typeof(s.value) = 'boolean'),
    p_default
  );
$$;

-- The message text at p_now; null when nobody has work today.
-- Kept as its own function so the content can be tested (and reused) without the scheduler.
create or replace function private.admin_daily_summary_body(p_today date, p_now timestamptz default now())
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with member as (
    select
      p.id,
      coalesce(nullif(btrim(p.full_name), ''), p.email) as name,
      count(*) as total_n,
      count(*) filter (where t.completed) as done_n,
      count(*) filter (where not t.completed and t.deadline_at < p_now) as late_n
    from public.tasks t
    join public.profiles p on p.id = t.assignee_id and p.active
    where private.task_in_range(t, p_today, p_today)
    group by p.id
  )
  select 'Tổng ' || sum(total_n) || ' · Xong ' || sum(done_n) || ' · Còn ' || sum(total_n - done_n) || ' · Quá hạn ' || sum(late_n)
    || E'\n' || string_agg(name || ' ' || done_n || '/' || total_n, E'\n' order by name, id)
  from member
  having count(*) > 0;
$$;

create or replace function private.schedule_admin_daily_summaries(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := private.app_timezone();
  local_now timestamp := p_now at time zone private.app_timezone();
  today date := (p_now at time zone private.app_timezone())::date;
  send_time time := private.setting_time('admin_daily_summary_time', '18:10');
  body text;
  n integer;
begin
  if not private.setting_bool('admin_daily_summary_enabled', true) then
    return 0;
  end if;
  -- Still worth sending up to two hours late (e.g. the job was down); after that it is stale.
  if local_now < today + send_time or local_now >= today + send_time + interval '2 hours' then
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
    (today + send_time) at time zone tz,
    jsonb_build_object('title', 'Tổng kết team hôm nay', 'body', body, 'url', '/overview')
  )), 0) into n
  from public.profiles a
  where a.role = 'ADMIN' and a.active and a.notification_enabled;

  return n;
end;
$$;

-- The scheduler, with the admin summary moved out into the function above. Everything else is as in Phase 13.
create or replace function private.schedule_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := private.app_timezone();
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

  -- ADMIN_DAILY_SUMMARY — one message per admin about the whole team.
  total := total + private.schedule_admin_daily_summaries(p_now);

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
    'schema_version', '20261007091734_admin_daily_summary',
    'server_time', now()
  );
$$;
