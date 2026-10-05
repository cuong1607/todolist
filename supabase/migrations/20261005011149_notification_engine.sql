-- Phase 9: notification engine, independent of any delivery channel.
--
--   business state ──▶ scheduler ──▶ notification_logs (queue + audit) ──▶ provider
--
--   * private.schedule_notifications()  decides WHAT is due and enqueues one row per provider,
--                                        idempotently (unique (provider, dedupe_key)).
--   * claim / complete / fail            the provider-agnostic delivery API with retries.
--   * IN_APP                             delivered inside the database (the row IS the message).
--   * ZALO (later)                       a worker calls claim_notifications('ZALO') and reports back.
--   * pg_cron runs private.notification_tick() every minute.

-- ============================================================
-- notification_logs: align with the spec
-- ============================================================
create type public.notification_type as enum (
  'MORNING_SUMMARY',
  'DEADLINE_REMINDER',
  'OVERDUE_REMINDER',
  'END_OF_DAY_SUMMARY',
  'ADMIN_DAILY_SUMMARY',
  -- Reserved (optional in the spec, not scheduled yet):
  'NEW_TASK',
  'DEADLINE_CHANGED'
);

-- Nothing wrote to this table before the engine existed; rows of an unknown kind cannot be mapped.
delete from public.notification_logs
where kind not in (select unnest(enum_range(null::public.notification_type))::text);

alter table public.notification_logs drop constraint notification_logs_kind_check;
alter table public.notification_logs
  alter column kind type public.notification_type using kind::public.notification_type;
alter table public.notification_logs rename column kind to type;

alter type public.notification_channel rename to notification_provider;
alter table public.notification_logs rename column channel to provider;

-- Status: PENDING → PROCESSING → SENT | FAILED (a failed attempt goes back to PENDING until retries run out).
drop index public.notification_logs_status_idx;
alter type public.notification_status rename to notification_status_old;
create type public.notification_status as enum ('PENDING', 'PROCESSING', 'SENT', 'FAILED');
alter table public.notification_logs
  alter column status drop default,
  alter column status type public.notification_status
    using (case status::text when 'SKIPPED' then 'FAILED' else status::text end)::public.notification_status,
  alter column status set default 'PENDING';
drop type public.notification_status_old;

alter table public.notification_logs
  add column scheduled_at timestamptz not null default now(),
  add column failed_at timestamptz,
  add column retry_count integer not null default 0 check (retry_count >= 0),
  add column external_message_id text,
  -- When a worker took the row (PROCESSING); lets the tick release rows whose worker died.
  add column claimed_at timestamptz;

-- The same notification may go out through several providers, once each.
alter table public.notification_logs drop constraint notification_logs_dedupe_key_key;
alter table public.notification_logs
  add constraint notification_logs_provider_dedupe_key unique (provider, dedupe_key);

-- Dispatcher hot path: due rows of one provider.
create index notification_logs_due_idx on public.notification_logs (provider, scheduled_at) where status = 'PENDING';
create index notification_logs_processing_idx on public.notification_logs (claimed_at) where status = 'PROCESSING';

comment on column public.notification_logs.payload is '{"title", "body", "url"?} — rendered by every provider';
comment on column public.notification_logs.dedupe_key is 'e.g. morning-summary:<user_id>:2026-10-03. Unique per provider.';

-- ============================================================
-- Preferences & team-wide times
-- ============================================================
alter table public.notification_settings
  add column end_of_day_summary_enabled boolean not null default true;

insert into public.system_settings (key, value, description) values
  ('end_of_day_summary_time', '"17:30"', 'Giờ gửi tổng kết cuối ngày cho nhân viên (HH:MM)'),
  ('admin_daily_summary_time', '"18:00"', 'Giờ gửi tổng kết team cho admin (HH:MM)')
on conflict (key) do nothing;

-- A system_settings value as a time of day; anything missing or malformed falls back to the default.
create or replace function private.setting_time(p_key text, p_default time)
returns time
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::time
     from public.system_settings s
     where s.key = p_key and s.value #>> '{}' ~ '^([01]\d|2[0-3]):[0-5]\d$'),
    p_default
  );
$$;

-- ============================================================
-- Enqueue: one row per provider the user can be reached on
-- ============================================================
create or replace function private.enqueue_notification(
  p_user_id uuid,
  p_task_id uuid,
  p_type public.notification_type,
  p_dedupe_key text,
  p_scheduled_at timestamptz,
  p_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.notification_logs (user_id, task_id, type, provider, payload, scheduled_at, dedupe_key)
  select p_user_id, p_task_id, p_type, pr.provider, p_payload, p_scheduled_at, p_dedupe_key
  from public.profiles p
  cross join lateral (
    select 'IN_APP'::public.notification_provider
    union all
    select 'ZALO'::public.notification_provider where p.zalo_connected
  ) pr(provider)
  where p.id = p_user_id
  on conflict (provider, dedupe_key) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- ============================================================
-- Scheduler: business state → due notifications. Safe to run as often as you like.
-- p_now exists so tests can pin the clock.
-- ============================================================
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
  -- MORNING_SUMMARY — at each member's chosen time, when there is something to do.
  select coalesce(sum(private.enqueue_notification(
    c.user_id, null, 'MORNING_SUMMARY',
    'morning-summary:' || c.user_id || ':' || today,
    (today + c.daily_summary_time) at time zone tz,
    jsonb_build_object(
      'title', 'Việc hôm nay',
      'body', 'Hôm nay bạn có ' || concat_ws(', ',
        case when c.fixed_n > 0 then c.fixed_n || ' việc cố định' end,
        case when c.due_n > 0 then c.due_n || ' việc đến hạn' end,
        case when c.late_n > 0 then c.late_n || ' việc quá hạn' end) || '.',
      'url', '/today')
  )), 0) into n
  from (
    select
      p.id as user_id,
      s.daily_summary_time,
      count(*) filter (where t.type = 'FIXED' and t.task_date = today) as fixed_n,
      count(*) filter (where t.type = 'ADHOC' and (t.deadline_at at time zone tz)::date = today) as due_n,
      count(*) filter (where t.type = 'ADHOC' and (t.deadline_at at time zone tz)::date < today) as late_n
    from public.profiles p
    join public.notification_settings s on s.user_id = p.id
    join public.tasks t on t.assignee_id = p.id and not t.completed
    where p.active and p.notification_enabled and s.daily_summary_enabled
      and local_now >= today + s.daily_summary_time
      and local_now < today + s.daily_summary_time + summary_window
    group by p.id, s.daily_summary_time
  ) c
  where c.fixed_n + c.due_n + c.late_n > 0;
  total := total + n;

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

-- ============================================================
-- Delivery API (provider-agnostic). Workers run with the service role.
-- ============================================================
-- Take up to p_limit due rows for one provider. SKIP LOCKED: concurrent workers never get the same row.
create or replace function public.claim_notifications(p_provider public.notification_provider, p_limit integer default 20)
returns setof public.notification_logs
language sql
security definer
set search_path = ''
as $$
  update public.notification_logs n
  set status = 'PROCESSING', claimed_at = now()
  where n.id in (
    select q.id
    from public.notification_logs q
    where q.provider = p_provider and q.status = 'PENDING' and q.scheduled_at <= now()
    order by q.scheduled_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  returning n.*;
$$;

create or replace function public.complete_notification(p_id bigint, p_external_message_id text default null)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with done as (
    update public.notification_logs
    set status = 'SENT', sent_at = now(), external_message_id = p_external_message_id, error = null, claimed_at = null
    where id = p_id and status = 'PROCESSING'
    returning 1
  )
  select exists (select 1 from done);
$$;

-- A failed attempt: retried after 1 then 5 minutes; the third failure is final.
create or replace function public.fail_notification(p_id bigint, p_error text)
returns public.notification_status
language sql
security definer
set search_path = ''
as $$
  update public.notification_logs
  set
    retry_count = retry_count + 1,
    error = left(p_error, 1000),
    claimed_at = null,
    status = case when retry_count + 1 >= 3 then 'FAILED' else 'PENDING' end::public.notification_status,
    failed_at = case when retry_count + 1 >= 3 then now() end,
    scheduled_at = case
      when retry_count + 1 >= 3 then scheduled_at
      else now() + case retry_count when 0 then interval '1 minute' else interval '5 minutes' end
    end
  where id = p_id and status = 'PROCESSING'
  returning status;
$$;

revoke execute on function public.claim_notifications(public.notification_provider, integer) from public, anon, authenticated;
revoke execute on function public.complete_notification(bigint, text) from public, anon, authenticated;
revoke execute on function public.fail_notification(bigint, text) from public, anon, authenticated;
grant execute on function public.claim_notifications(public.notification_provider, integer) to service_role;
grant execute on function public.complete_notification(bigint, text) to service_role;
grant execute on function public.fail_notification(bigint, text) to service_role;

-- Rows whose worker died mid-send count as a failed attempt.
create or replace function private.release_stuck_notifications()
returns integer
language sql
security definer
set search_path = ''
as $$
  with stuck as (
    select public.fail_notification(n.id, 'Hết thời gian xử lý (worker không phản hồi)') as status
    from public.notification_logs n
    where n.status = 'PROCESSING' and n.claimed_at < now() - interval '10 minutes'
  )
  select count(*)::integer from stuck;
$$;

-- IN_APP provider: the row itself is what the member reads in the app, so "sending" is marking it SENT.
create or replace function private.deliver_in_app(p_now timestamptz default now())
returns integer
language sql
security definer
set search_path = ''
as $$
  with sent as (
    update public.notification_logs
    set status = 'SENT', sent_at = p_now
    where provider = 'IN_APP' and status = 'PENDING' and scheduled_at <= p_now
    returning 1
  )
  select count(*)::integer from sent;
$$;

create or replace function private.notification_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.release_stuck_notifications();
  perform private.schedule_notifications();
  perform private.deliver_in_app();
end;
$$;

-- ============================================================
-- Schedule
-- ============================================================
select cron.schedule('notification-tick', '* * * * *', $$ select private.notification_tick(); $$);
-- A per-minute job fills pg_cron's run history quickly; keep a week (02:30 Asia/Bangkok).
select cron.schedule(
  'cron-history-cleanup',
  '30 19 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days'; $$
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
    'schema_version', '20261005011149_notification_engine',
    'server_time', now()
  );
$$;
