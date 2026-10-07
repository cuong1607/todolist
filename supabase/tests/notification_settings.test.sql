-- Phase 15 notification settings: one schedule with its defaults, read by every scheduler, so a
-- change made by an admin moves the scheduler. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(15);

-- The per-minute cron job may already have queued rows for the seed users; start from a known state.
delete from notification_logs;

create function pg_temp.at(p_time time) returns timestamptz language sql as
$$ select (private.today_local() + p_time) at time zone private.app_timezone() $$;
create function pg_temp.sent(p_type text) returns integer language sql as
$$ select count(*)::integer from notification_logs where type::text = p_type $$;

-- ---------- defaults ----------
select results_eq(
  $$ select * from private.notification_schedule() $$,
  $$ values ('Asia/Bangkok', time '08:00', time '18:00', true, time '18:10', 60) $$,
  'defaults: Asia/Bangkok · morning 08:00 · end of day 18:00 · admin summary on at 18:10 · reminder 60 minutes'
);

-- ---------- the app reads the same schedule ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select results_eq(
  $$ select * from notification_schedule() $$,
  $$ values ('Asia/Bangkok', '08:00', '18:00', true, '18:10', 60) $$,
  'a member reads the schedule through the RPC (times as HH:MM)'
);
update system_settings set value = '"07:00"' where key = 'morning_summary_time';
select is((select morning_summary_time from notification_schedule()), '08:00', 'a member cannot change the schedule');
reset role;
set local role anon;
select throws_ok($$ select * from notification_schedule() $$, '42501', null, 'signed-out visitors cannot read the schedule');
reset role;

-- ---------- an admin changes it ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
update system_settings set value = '"06:00"' where key = 'morning_summary_time';
update system_settings set value = '"20:00"' where key = 'end_of_day_summary_time';
update system_settings set value = '"20:30"' where key = 'admin_daily_summary_time';
update system_settings set value = '120' where key = 'deadline_reminder_minutes';
reset role;
select results_eq(
  $$ select * from private.notification_schedule() $$,
  $$ values ('Asia/Bangkok', time '06:00', time '20:00', true, time '20:30', 120) $$,
  'what an admin saves is what the schedulers read'
);

-- ---------- …and the scheduler follows ----------
insert into tasks (id, type, assignee_id, title, deadline_at, created_at) values
  ('40000000-0000-4000-8000-000000000001', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'due at noon', pg_temp.at('12:00'), pg_temp.at('05:00'));

select private.schedule_notifications(pg_temp.at('06:05'));
select cmp_ok(pg_temp.sent('MORNING_SUMMARY'), '>=', 1, 'morning summary goes out at the new 06:00');
select is(
  (select max(scheduled_at) from notification_logs where type = 'MORNING_SUMMARY'),
  pg_temp.at('06:00'),
  '…scheduled for exactly that time'
);

select private.schedule_notifications(pg_temp.at('09:55'));
select is(
  (select count(*)::integer from notification_logs where type = 'DEADLINE_REMINDER' and task_id = '40000000-0000-4000-8000-000000000001'),
  0,
  'no reminder more than 120 minutes ahead'
);
select private.schedule_notifications(pg_temp.at('10:05'));
select is(
  (select scheduled_at from notification_logs where type = 'DEADLINE_REMINDER' and task_id = '40000000-0000-4000-8000-000000000001'),
  pg_temp.at('10:00'),
  'the reminder follows the new 120-minute lead time'
);

select private.schedule_notifications(pg_temp.at('18:15'));
select is(pg_temp.sent('END_OF_DAY_SUMMARY') + pg_temp.sent('ADMIN_DAILY_SUMMARY'), 0, 'nothing goes out at the old default times');
select private.schedule_notifications(pg_temp.at('20:05'));
select ok(pg_temp.sent('END_OF_DAY_SUMMARY') >= 1 and pg_temp.sent('ADMIN_DAILY_SUMMARY') = 0, 'end-of-day summary goes out at the new 20:00');
select private.schedule_notifications(pg_temp.at('20:35'));
select is(pg_temp.sent('ADMIN_DAILY_SUMMARY'), 2, 'admin summary goes out at the new 20:30');

-- ---------- switches ----------
delete from notification_logs;
update system_settings set value = 'false' where key = 'admin_daily_summary_enabled';
update system_settings set value = '0' where key = 'deadline_reminder_minutes';
update tasks set deadline_at = pg_temp.at('21:00') where id = '40000000-0000-4000-8000-000000000001';
select private.schedule_notifications(pg_temp.at('20:35'));
select is(pg_temp.sent('ADMIN_DAILY_SUMMARY') + pg_temp.sent('DEADLINE_REMINDER'), 0, 'switched off by the admin: no admin summary, no reminders');

-- ---------- a bad value can never stop the job ----------
update system_settings set value = '"25:99"' where key = 'morning_summary_time';
update system_settings set value = '"soon"' where key = 'end_of_day_summary_time';
update system_settings set value = '"yes"' where key = 'admin_daily_summary_enabled';
update system_settings set value = '45' where key = 'deadline_reminder_minutes';
delete from system_settings where key = 'admin_daily_summary_time';
select results_eq(
  $$ select * from private.notification_schedule() $$,
  $$ values ('Asia/Bangkok', time '08:00', time '18:00', true, time '18:10', 60) $$,
  'missing or malformed values fall back to the defaults'
);
select lives_ok($$ select private.schedule_notifications() $$, 'the scheduler still runs');

select * from finish();
rollback;
