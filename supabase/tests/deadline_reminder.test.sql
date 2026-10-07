-- Phase 12 deadline reminder: ad-hoc only, never for completed tasks, never twice, follows a moved
-- deadline, lead time set by an admin. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

-- The per-minute cron job may already have queued rows for the seed users; start from a known state.
delete from notification_logs;

create function pg_temp.at(p_time time) returns timestamptz language sql as
$$ select (private.today_local() + p_time) at time zone private.app_timezone() $$;
-- Titles of An's tasks that have a reminder, and how many reminders one task has per provider.
create function pg_temp.reminded() returns text[] language sql as
$$ select coalesce(array_agg(distinct t.title order by t.title), '{}')
   from notification_logs n join tasks t on t.id = n.task_id
   where n.type = 'DEADLINE_REMINDER' and n.user_id = '00000000-0000-4000-8000-000000000002' $$;
create function pg_temp.reminders(p_task uuid, p_provider text default 'IN_APP') returns integer language sql as
$$ select count(*)::integer from notification_logs where type = 'DEADLINE_REMINDER' and task_id = p_task and provider::text = p_provider $$;

-- Fixtures for An, relative to 10:00.
insert into tasks (id, type, assignee_id, title, deadline_at, completed, completed_at, created_at) values
  ('30000000-0000-4000-8000-000000000001', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'in 20', pg_temp.at('10:20'), false, null, pg_temp.at('07:00')),
  ('30000000-0000-4000-8000-000000000002', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'in 50', pg_temp.at('10:50'), false, null, pg_temp.at('07:00')),
  ('30000000-0000-4000-8000-000000000003', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'in 100', pg_temp.at('11:40'), false, null, pg_temp.at('07:00')),
  ('30000000-0000-4000-8000-000000000004', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'date only', pg_temp.at('23:59'), false, null, pg_temp.at('07:00')),
  ('30000000-0000-4000-8000-000000000005', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'no deadline', null, false, null, pg_temp.at('07:00')),
  ('30000000-0000-4000-8000-000000000006', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'done', pg_temp.at('10:15'), true, pg_temp.at('09:00'), pg_temp.at('07:00')),
  ('30000000-0000-4000-8000-000000000007', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'already late', pg_temp.at('09:50'), false, null, pg_temp.at('07:00'));
-- A fixed task due in 10 minutes must not be reminded.
update tasks set deadline_at = pg_temp.at('10:10')
where type = 'FIXED' and assignee_id = '00000000-0000-4000-8000-000000000002' and task_date = private.today_local();

select hasnt_column('notification_settings', 'remind_before_minutes', 'the per-member lead time is gone: one team setting, set by an admin');
select is((select deadline_reminder_minutes from private.notification_schedule()), 60, 'the lead time defaults to 60 minutes');
-- The rules below are written for a 30-minute lead time.
update system_settings set value = '30' where key = 'deadline_reminder_minutes';

-- ---------- the rule (lead time 30) ----------
select is(private.schedule_deadline_reminders(pg_temp.at('10:00')), 1, 'one reminder is queued at 10:00');
select is(
  pg_temp.reminded(),
  array['in 20'],
  'only an open ad-hoc task with a timed deadline inside the lead time: not fixed, completed, date-only, no-deadline or already late'
);
select results_eq(
  $$ select scheduled_at, dedupe_key, payload ->> 'title' from notification_logs where type = 'DEADLINE_REMINDER' $$,
  $$ values (pg_temp.at('09:50'), 'deadline-reminder:30000000-0000-4000-8000-000000000001:' || extract(epoch from pg_temp.at('10:20'))::bigint, 'Sắp đến hạn') $$,
  'scheduled 30 minutes ahead, keyed deadline-reminder:<task>:<deadline epoch>'
);

-- ---------- no duplicates ----------
select is(private.schedule_deadline_reminders(pg_temp.at('10:01')), 0, 're-running the scheduler queues nothing twice');
select private.deliver_in_app(pg_temp.at('10:01'));
select is(private.schedule_deadline_reminders(pg_temp.at('10:02')), 0, '…nor after the reminder was sent');
select is(pg_temp.reminders('30000000-0000-4000-8000-000000000001'), 1, 'exactly one reminder for the task');

-- ---------- completed tasks ----------
update tasks set completed = true, completed_at = now() where id = '30000000-0000-4000-8000-000000000002';
select is(private.schedule_deadline_reminders(pg_temp.at('10:25')), 0, 'a task completed before its reminder time is not reminded');
update tasks set completed = false, completed_at = null where id = '30000000-0000-4000-8000-000000000002';
select is(private.schedule_deadline_reminders(pg_temp.at('10:26')), 1, 'reopened while the deadline is still ahead: reminded');

-- ---------- a moved deadline ----------
update tasks set deadline_at = pg_temp.at('12:00') where id = '30000000-0000-4000-8000-000000000001';
select private.schedule_deadline_reminders(pg_temp.at('10:27'));
select is(pg_temp.reminders('30000000-0000-4000-8000-000000000001'), 1, 'moved out of the lead time: no new reminder yet');
select private.schedule_deadline_reminders(pg_temp.at('11:31'));
select results_eq(
  $$ select scheduled_at from notification_logs
     where type = 'DEADLINE_REMINDER' and task_id = '30000000-0000-4000-8000-000000000001' order by scheduled_at $$,
  $$ values (pg_temp.at('09:50')), (pg_temp.at('11:30')) $$,
  'the reminder follows the new deadline: sent again 30 minutes before it'
);

-- ---------- the admin's lead time ----------
delete from notification_logs;
update tasks set deadline_at = pg_temp.at('10:20') where id = '30000000-0000-4000-8000-000000000001';

update system_settings set value = '60' where key = 'deadline_reminder_minutes';
select private.schedule_deadline_reminders(pg_temp.at('10:00'));
select is(pg_temp.reminded(), array['in 20', 'in 50'], '60 minutes: tasks due within the hour');

update system_settings set value = '120' where key = 'deadline_reminder_minutes';
select private.schedule_deadline_reminders(pg_temp.at('10:00'));
select is(pg_temp.reminded(), array['in 100', 'in 20', 'in 50'], '120 minutes: tasks due within two hours');
select is(
  (select scheduled_at from notification_logs where type = 'DEADLINE_REMINDER' and task_id = '30000000-0000-4000-8000-000000000003'),
  pg_temp.at('09:40'),
  'scheduled 120 minutes ahead'
);

update system_settings set value = '30' where key = 'deadline_reminder_minutes';
select is(private.schedule_deadline_reminders(pg_temp.at('10:00')), 0, 'changing the lead time does not repeat a reminder');

delete from notification_logs;
update system_settings set value = '0' where key = 'deadline_reminder_minutes';
select is(private.schedule_deadline_reminders(pg_temp.at('10:00')), 0, 'off: nothing is queued');

update system_settings set value = '45' where key = 'deadline_reminder_minutes';
select is((select deadline_reminder_minutes from private.notification_schedule()), 60, 'a value outside the options falls back to the default (60)');
update system_settings set value = '30' where key = 'deadline_reminder_minutes';

-- ---------- member switch ----------
update notification_settings set deadline_reminder_enabled = false where user_id = '00000000-0000-4000-8000-000000000002';
select is(private.schedule_deadline_reminders(pg_temp.at('10:00')), 0, 'a member who switched reminders off is skipped');
update notification_settings set deadline_reminder_enabled = true where user_id = '00000000-0000-4000-8000-000000000002';

-- ---------- queued for Zalo, then no longer true ----------
update profiles set zalo_connected = true, zalo_user_id = 'zalo-an' where id = '00000000-0000-4000-8000-000000000002';
update system_settings set value = 'true' where key = 'zalo_enabled';
select is(private.schedule_deadline_reminders(pg_temp.at('10:00')), 2, 'a linked member gets the reminder in the app and on Zalo');
select private.deliver_in_app(pg_temp.at('10:00'));
select is(
  (select status::text from notification_logs where type = 'DEADLINE_REMINDER' and provider = 'ZALO'),
  'PENDING',
  'the Zalo row waits for the worker'
);

update tasks set completed = true, completed_at = now() where id = '30000000-0000-4000-8000-000000000001';
select private.schedule_deadline_reminders(pg_temp.at('10:01'));
select is(pg_temp.reminders('30000000-0000-4000-8000-000000000001', 'ZALO'), 0, 'completed before the worker sent it: the queued reminder is dropped');

update tasks set completed = false, completed_at = null where id = '30000000-0000-4000-8000-000000000001';
select private.schedule_deadline_reminders(pg_temp.at('10:02'));
update tasks set deadline_at = pg_temp.at('15:00') where id = '30000000-0000-4000-8000-000000000001';
select private.schedule_deadline_reminders(pg_temp.at('10:03'));
select is(pg_temp.reminders('30000000-0000-4000-8000-000000000001', 'ZALO'), 0, 'rescheduled before the worker sent it: the reminder for the old deadline is dropped');

-- ---------- the whole scheduler ----------
delete from notification_logs;
update tasks set deadline_at = pg_temp.at('10:20') where id = '30000000-0000-4000-8000-000000000001';
select private.schedule_notifications(pg_temp.at('10:00'));
select is(pg_temp.reminders('30000000-0000-4000-8000-000000000001'), 1, 'private.schedule_notifications() runs the deadline reminder');

select * from finish();
rollback;
