-- Phase 9 notification engine: scheduling rules, dedupe, delivery API, retries. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

-- The per-minute cron job may already have queued rows for the seed users; start from a known state.
delete from notification_logs;

-- Pin the clock: "today 08:05 local". An's morning summary is at 08:00 (default).
create function pg_temp.at(p_time time) returns timestamptz language sql as
$$ select (private.today_local() + p_time) at time zone private.app_timezone() $$;
create function pg_temp.logs(p_type text, p_user uuid) returns integer language sql as
$$ select count(*)::integer from notification_logs where type::text = p_type and user_id = p_user $$;

-- Fixtures for An, relative to 08:05.
insert into tasks (id, type, assignee_id, title, deadline_at, created_at) values
  ('20000000-0000-4000-8000-000000000001', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'due soon', pg_temp.at('08:25'), pg_temp.at('07:00')),
  ('20000000-0000-4000-8000-000000000002', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'due later', pg_temp.at('11:00'), pg_temp.at('07:00')),
  ('20000000-0000-4000-8000-000000000003', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'date only', pg_temp.at('23:59'), pg_temp.at('07:00')),
  ('20000000-0000-4000-8000-000000000004', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'just late', pg_temp.at('07:30'), pg_temp.at('07:00')),
  ('20000000-0000-4000-8000-000000000005', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'late for days', pg_temp.at('07:30') - interval '3 days', pg_temp.at('07:00') - interval '4 days');

-- Bình has muted everything.
update profiles set notification_enabled = false where id = '00000000-0000-4000-8000-000000000003';

-- ---------- scheduler ----------
select cmp_ok(private.schedule_notifications(pg_temp.at('08:05')), '>', 0, 'scheduler enqueues due notifications');

select is(
  (select dedupe_key from notification_logs where type = 'MORNING_SUMMARY' and user_id = '00000000-0000-4000-8000-000000000002'),
  'morning-summary:00000000-0000-4000-8000-000000000002:' || private.today_local(),
  'morning summary: one per member per day, keyed morning-summary:<user>:<date>'
);
select matches(
  (select payload ->> 'body' from notification_logs where type = 'MORNING_SUMMARY' and user_id = '00000000-0000-4000-8000-000000000002'),
  '^Hôm nay bạn có 3 việc cố định, \d+ việc đến hạn, \d+ việc quá hạn\.$',
  'morning summary body counts fixed, due-today and overdue tasks'
);
select is(
  (select array_agg(t.title order by t.title) from notification_logs n join tasks t on t.id = n.task_id where n.type = 'DEADLINE_REMINDER'),
  array['due soon'],
  'deadline reminder: only inside remind_before_minutes, never for date-only (23:59) deadlines'
);
select is(
  (select scheduled_at from notification_logs where type = 'DEADLINE_REMINDER'),
  pg_temp.at('07:55'),
  'deadline reminder is scheduled remind_before_minutes (30) ahead of the deadline'
);
select ok(
  exists (select 1 from notification_logs n where n.type = 'OVERDUE_REMINDER' and n.task_id = '20000000-0000-4000-8000-000000000004')
  and not exists (select 1 from notification_logs n where n.type = 'OVERDUE_REMINDER' and n.task_id = '20000000-0000-4000-8000-000000000005'),
  'overdue reminder: for a deadline that just passed, not for old backlog'
);
select is(
  (select count(*)::integer from notification_logs where user_id = '00000000-0000-4000-8000-000000000003'),
  0,
  'nothing is queued for a member who turned notifications off'
);
select is(pg_temp.logs('END_OF_DAY_SUMMARY', '00000000-0000-4000-8000-000000000002'), 0, 'no end-of-day summary in the morning');

-- ---------- duplicate protection ----------
select is(private.schedule_notifications(pg_temp.at('08:06')), 0, 're-running the scheduler queues nothing twice');

-- Rescheduling a task makes its reminder due again under a new key.
update tasks set deadline_at = pg_temp.at('08:30') where id = '20000000-0000-4000-8000-000000000001';
select is(private.schedule_notifications(pg_temp.at('08:06')), 1, 'a rescheduled deadline gets a fresh reminder');

-- ---------- preferences ----------
update notification_settings set overdue_alert_enabled = false where user_id = '00000000-0000-4000-8000-000000000002';
update tasks set deadline_at = pg_temp.at('08:07') where id = '20000000-0000-4000-8000-000000000002';
select private.schedule_notifications(pg_temp.at('08:10'));
select is(
  (select count(*)::integer from notification_logs where type = 'OVERDUE_REMINDER' and task_id = '20000000-0000-4000-8000-000000000002'),
  0,
  'a switched-off notification type is not scheduled'
);

-- ---------- evening summaries (17:30 / 18:00 from system_settings) ----------
select private.schedule_notifications(pg_temp.at('18:05'));
select matches(
  (select payload ->> 'body' from notification_logs where type = 'END_OF_DAY_SUMMARY' and user_id = '00000000-0000-4000-8000-000000000002'),
  '^Hôm nay bạn đã xong \d+/\d+ việc\.',
  'end-of-day summary for members with work today'
);
select is(
  (select array_agg(user_id) from notification_logs where type = 'ADMIN_DAILY_SUMMARY'),
  array['00000000-0000-4000-8000-000000000001'::uuid],
  'admin daily summary goes to admins only'
);
update system_settings set value = '"20:00"' where key = 'admin_daily_summary_time';
delete from notification_logs where type = 'ADMIN_DAILY_SUMMARY';
select private.schedule_notifications(pg_temp.at('18:05'));
select is(pg_temp.logs('ADMIN_DAILY_SUMMARY', '00000000-0000-4000-8000-000000000001'), 0, 'summary time follows system_settings');

-- ---------- IN_APP provider ----------
select cmp_ok(private.deliver_in_app(pg_temp.at('18:05')), '>', 0, 'in-app delivery marks due rows as sent');
select is(
  (select count(*)::integer from notification_logs where provider = 'IN_APP' and (status <> 'SENT' or sent_at is null)),
  0,
  'every in-app notification is SENT with sent_at'
);

-- ---------- a second provider: one row each, delivered through claim / complete / fail ----------
delete from notification_logs;
update profiles set zalo_connected = true where id = '00000000-0000-4000-8000-000000000002';
select is(
  private.enqueue_notification('00000000-0000-4000-8000-000000000002', null, 'NEW_TASK', 'test:1', now() - interval '1 minute', '{"title":"t","body":"b"}'),
  2,
  'a member reachable on two providers gets one row per provider'
);
select is(
  private.enqueue_notification('00000000-0000-4000-8000-000000000002', null, 'NEW_TASK', 'test:1', now(), '{"title":"t","body":"b"}'),
  0,
  'the same dedupe_key is never queued twice for a provider'
);

select is((select count(*)::integer from claim_notifications('ZALO')), 1, 'a worker claims the due rows of its provider');
select is((select count(*)::integer from claim_notifications('ZALO')), 0, 'a claimed row (PROCESSING) is not handed out again');

select is(
  (select fail_notification(id, 'timeout') from notification_logs where provider = 'ZALO')::text,
  'PENDING',
  'a failed attempt goes back to PENDING for a retry'
);
select results_eq(
  $$ select retry_count, error, scheduled_at > now() from notification_logs where provider = 'ZALO' $$,
  $$ values (1, 'timeout', true) $$,
  'the retry is counted, the error kept, and the next attempt delayed'
);

-- Two more failed attempts exhaust the retries.
update notification_logs set scheduled_at = now() - interval '1 second' where provider = 'ZALO';
select fail_notification(id, 'timeout 2') from claim_notifications('ZALO');
update notification_logs set scheduled_at = now() - interval '1 second' where provider = 'ZALO';
select fail_notification(id, 'timeout 3') from claim_notifications('ZALO');
select results_eq(
  $$ select status::text, retry_count, failed_at is not null from notification_logs where provider = 'ZALO' $$,
  $$ values ('FAILED', 3, true) $$,
  'the third failure is final: FAILED with failed_at'
);

-- Success path, and the API is not callable by signed-in users.
select enqueue_notification.* from private.enqueue_notification(
  '00000000-0000-4000-8000-000000000002', null, 'NEW_TASK', 'test:2', now() - interval '1 minute', '{"title":"t","body":"b"}') enqueue_notification;
select complete_notification(id, 'zalo-msg-1') from claim_notifications('ZALO');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$ select * from claim_notifications('IN_APP') $$, '42501', null, 'signed-in users (even admins) cannot call the delivery API');
reset role;

select * from finish();
rollback;
