-- Phase 11 morning summary: one message per member, own data only, at the admin's time. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(15);

-- The per-minute cron job may already have queued today's summaries; start from a known state.
delete from notification_logs;

create function pg_temp.at(p_time time) returns timestamptz language sql as
$$ select (private.today_local() + p_time) at time zone private.app_timezone() $$;
create function pg_temp.body(p_user uuid) returns text language sql as
$$ select payload ->> 'body' from notification_logs where type = 'MORNING_SUMMARY' and provider = 'IN_APP' and user_id = p_user $$;

-- Seed: An has 3 fixed tasks today, 1 ad-hoc due today (23:00), 1 ad-hoc overdue since yesterday,
-- plus a no-deadline and an upcoming task that must not be counted. Bình has only fixed tasks; give
-- Bình one ad-hoc due today, and both of them a finished task that must not be counted either.
insert into tasks (type, assignee_id, title, deadline_at, completed, completed_at, created_at) values
  ('ADHOC', '00000000-0000-4000-8000-000000000003', 'binh due today', pg_temp.at('16:00'), false, null, now()),
  ('ADHOC', '00000000-0000-4000-8000-000000000003', 'binh done', pg_temp.at('15:00'), true, now(), now()),
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'an done', pg_temp.at('15:00'), true, now(), now());

select hasnt_column('notification_settings', 'daily_summary_time', 'the per-member time is gone: one team time, set by an admin');

-- ---------- 08:00 by default ----------
select is(private.schedule_morning_summaries(pg_temp.at('07:59')), 0, 'nothing before 08:00');
select cmp_ok(private.schedule_morning_summaries(pg_temp.at('08:00')), '>=', 2, 'summaries are queued at 08:00');

select is(
  pg_temp.body('00000000-0000-4000-8000-000000000002'),
  E'Cố định: 3\nĐến hạn hôm nay: 1\nQuá hạn: 1',
  'An''s summary: fixed today, ad-hoc due today, ad-hoc overdue — one number per line'
);
select is(
  pg_temp.body('00000000-0000-4000-8000-000000000003'),
  E'Cố định: ' || (select count(*) from tasks where assignee_id = '00000000-0000-4000-8000-000000000003' and type = 'FIXED' and task_date = private.today_local())
    || E'\nĐến hạn hôm nay: 1\nQuá hạn: 0',
  'Bình''s summary is built from Bình''s tasks only'
);
-- The Definition of Done, for every recipient at once: the body equals that member's own counts.
select is(
  (select bool_and(n.payload ->> 'body' = 'Cố định: ' || c.fixed_n || E'\nĐến hạn hôm nay: ' || c.due_n || E'\nQuá hạn: ' || c.late_n)
   from notification_logs n
   cross join lateral private.morning_summary_counts(n.user_id, private.today_local()) c
   where n.type = 'MORNING_SUMMARY'),
  true,
  'every member receives exactly their own numbers'
);
select results_eq(
  $$ select count(*)::integer, count(task_id)::integer, max(payload ->> 'title')
     from notification_logs where type = 'MORNING_SUMMARY' and user_id = '00000000-0000-4000-8000-000000000002' $$,
  $$ values (1, 0, 'Công việc hôm nay') $$,
  'one combined message per member — not one per task'
);
select is(
  (select count(*)::integer from notification_logs where type = 'MORNING_SUMMARY' and user_id = '00000000-0000-4000-8000-000000000005'),
  0,
  'a member with nothing to do today gets no message'
);
select is(private.schedule_morning_summaries(pg_temp.at('08:30')), 0, 'running again the same morning sends nothing twice');

-- ---------- member switch ----------
delete from notification_logs;
update notification_settings set daily_summary_enabled = false where user_id = '00000000-0000-4000-8000-000000000003';
select private.schedule_morning_summaries(pg_temp.at('08:05'));
select ok(
  pg_temp.body('00000000-0000-4000-8000-000000000003') is null and pg_temp.body('00000000-0000-4000-8000-000000000002') is not null,
  'a member who switched the summary off is skipped; others are not'
);

-- ---------- admin-configured time ----------
delete from notification_logs;
update system_settings set value = '"09:30"' where key = 'morning_summary_time';
select is(private.schedule_morning_summaries(pg_temp.at('08:05')), 0, 'after the admin moves it to 09:30, nothing goes out at 08:05');
select cmp_ok(private.schedule_morning_summaries(pg_temp.at('09:35')), '>=', 1, '…and it goes out at the new time');
select is(
  (select scheduled_at from notification_logs where type = 'MORNING_SUMMARY' and user_id = '00000000-0000-4000-8000-000000000002'),
  pg_temp.at('09:30'),
  'scheduled for the configured time'
);
update system_settings set value = '"10:00"' where key = 'morning_summary_time';
select is(private.schedule_morning_summaries(pg_temp.at('10:05')), 0, 'changing the time later the same day does not send a second summary');

-- ---------- Zalo gets the same single message ----------
delete from notification_logs;
update profiles set zalo_connected = true, zalo_user_id = 'zalo-an' where id = '00000000-0000-4000-8000-000000000002';
update system_settings set value = 'true' where key = 'zalo_enabled';
select private.schedule_morning_summaries(pg_temp.at('10:05'));
select results_eq(
  $$ select provider::text, payload ->> 'body' from notification_logs
     where type = 'MORNING_SUMMARY' and user_id = '00000000-0000-4000-8000-000000000002' order by provider::text $$,
  $$ values ('IN_APP', E'Cố định: 3\nĐến hạn hôm nay: 1\nQuá hạn: 1'), ('ZALO', E'Cố định: 3\nĐến hạn hôm nay: 1\nQuá hạn: 1') $$,
  'a linked member gets the same summary once in the app and once on Zalo'
);

select * from finish();
rollback;
