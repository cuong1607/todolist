-- Phase 13 end-of-day summary: one message per member, own data only, at the admin's time, and
-- only a snapshot — work goes on afterwards. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(19);

-- The per-minute cron job may already have queued today's summaries; start from a known state.
delete from notification_logs;

create function pg_temp.at(p_time time) returns timestamptz language sql as
$$ select (private.today_local() + p_time) at time zone private.app_timezone() $$;
create function pg_temp.body(p_user uuid, p_provider text default 'IN_APP') returns text language sql as
$$ select payload ->> 'body' from notification_logs where type = 'END_OF_DAY_SUMMARY' and provider::text = p_provider and user_id = p_user $$;

-- Seed: An has 3 fixed tasks today and 4 open ad-hoc tasks (due today 23:00, overdue since yesterday,
-- no deadline, upcoming). Bình has only fixed tasks. On top of that:
--   An    finishes one fixed task and one ad-hoc task today; an ad-hoc finished yesterday must not count.
--   Bình  gets an ad-hoc task that became overdue at 17:00.
update tasks set completed = true, completed_at = pg_temp.at('09:00')
where id = (select id from tasks where type = 'FIXED' and assignee_id = '00000000-0000-4000-8000-000000000002'
            and task_date = private.today_local() order by sort_order, id limit 1);
insert into tasks (type, assignee_id, title, deadline_at, completed, completed_at, created_at) values
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'an done today', pg_temp.at('15:00'), true, pg_temp.at('14:00'), pg_temp.at('08:00')),
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'an done yesterday', null, true, pg_temp.at('14:00') - interval '1 day', pg_temp.at('08:00') - interval '2 days'),
  ('ADHOC', '00000000-0000-4000-8000-000000000003', 'binh late', pg_temp.at('17:00'), false, null, pg_temp.at('08:00'));

select is(private.setting_time('end_of_day_summary_time', '00:00'), time '18:00', 'the team''s end-of-day time defaults to 18:00');

-- ---------- 18:00 by default ----------
select is(private.schedule_end_of_day_summaries(pg_temp.at('17:59')), 0, 'nothing before 18:00');
select cmp_ok(private.schedule_end_of_day_summaries(pg_temp.at('18:00')), '>=', 2, 'summaries are queued at 18:00');

select is(
  pg_temp.body('00000000-0000-4000-8000-000000000002'),
  E'Cố định: xong 1, chưa xong 2\nPhát sinh: xong hôm nay 1, đang tồn 4, quá hạn 1',
  'An''s summary: fixed done / not done, ad-hoc done today / outstanding / overdue'
);
select is(
  pg_temp.body('00000000-0000-4000-8000-000000000003'),
  'Cố định: xong 0, chưa xong '
    || (select count(*) from tasks where assignee_id = '00000000-0000-4000-8000-000000000003' and type = 'FIXED' and task_date = private.today_local())
    || E'\nPhát sinh: xong hôm nay 0, đang tồn 1, quá hạn 1',
  'Bình''s summary is built from Bình''s tasks only'
);
-- The Definition of Done, for every recipient at once: the body equals that member's own counts.
select is(
  (select bool_and(n.payload ->> 'body' = 'Cố định: xong ' || c.fixed_done || ', chưa xong ' || c.fixed_missed
     || E'\nPhát sinh: xong hôm nay ' || c.adhoc_done || ', đang tồn ' || c.adhoc_open || ', quá hạn ' || c.adhoc_late)
   from notification_logs n
   cross join lateral private.end_of_day_counts(n.user_id, private.today_local(), pg_temp.at('18:00')) c
   where n.type = 'END_OF_DAY_SUMMARY'),
  true,
  'every member receives exactly their own numbers'
);
select results_eq(
  $$ select count(*)::integer, count(task_id)::integer, max(payload ->> 'title'), max(scheduled_at)
     from notification_logs where type = 'END_OF_DAY_SUMMARY' and user_id = '00000000-0000-4000-8000-000000000002' $$,
  $$ values (1, 0, 'Tổng kết hôm nay', pg_temp.at('18:00')) $$,
  'one combined message per member, scheduled for 18:00'
);
select is(
  (select count(*)::integer from notification_logs where type = 'END_OF_DAY_SUMMARY' and user_id = '00000000-0000-4000-8000-000000000005'),
  0,
  'a member with no work at all gets no message'
);
select is(private.schedule_end_of_day_summaries(pg_temp.at('18:30')), 0, 'running again the same evening sends nothing twice');

-- ---------- only a snapshot: nothing is locked ----------
select private.deliver_in_app(pg_temp.at('18:30'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ update tasks set completed = true
     where id = (select id from tasks where type = 'FIXED' and task_date = private.today_local() and not completed order by sort_order, id limit 1) $$,
  'a member can still complete a task after the summary went out'
);
reset role;
select is(
  (select count(*)::integer from tasks
   where assignee_id = '00000000-0000-4000-8000-000000000002' and type = 'FIXED' and task_date = private.today_local()
     and completed and completed_at = now() and completed_by = '00000000-0000-4000-8000-000000000002'),
  1,
  'completed_at is the real time of completion, not the summary time'
);
select is(
  (select fixed_done from private.end_of_day_counts('00000000-0000-4000-8000-000000000002', private.today_local(), pg_temp.at('18:40'))),
  2,
  'the live numbers move on…'
);
select ok(
  private.schedule_end_of_day_summaries(pg_temp.at('18:40')) = 0
    and pg_temp.body('00000000-0000-4000-8000-000000000002') = E'Cố định: xong 1, chưa xong 2\nPhát sinh: xong hôm nay 1, đang tồn 4, quá hạn 1',
  '…while the message already sent stays as it was and is not sent again'
);

-- ---------- member switch ----------
delete from notification_logs;
update notification_settings set end_of_day_summary_enabled = false where user_id = '00000000-0000-4000-8000-000000000003';
select private.schedule_end_of_day_summaries(pg_temp.at('18:05'));
select ok(
  pg_temp.body('00000000-0000-4000-8000-000000000003') is null and pg_temp.body('00000000-0000-4000-8000-000000000002') is not null,
  'a member who switched the summary off is skipped; others are not'
);

-- ---------- admin-configured time ----------
delete from notification_logs;
update system_settings set value = '"19:00"' where key = 'end_of_day_summary_time';
select is(private.schedule_end_of_day_summaries(pg_temp.at('18:05')), 0, 'after the admin moves it to 19:00, nothing goes out at 18:05');
select cmp_ok(private.schedule_end_of_day_summaries(pg_temp.at('19:05')), '>=', 1, '…and it goes out at the new time');
select is(
  (select scheduled_at from notification_logs where type = 'END_OF_DAY_SUMMARY' and user_id = '00000000-0000-4000-8000-000000000002'),
  pg_temp.at('19:00'),
  'scheduled for the configured time'
);
update system_settings set value = '"19:30"' where key = 'end_of_day_summary_time';
select is(private.schedule_end_of_day_summaries(pg_temp.at('19:35')), 0, 'changing the time later the same day does not send a second summary');

-- ---------- Zalo gets the same single message ----------
delete from notification_logs;
update profiles set zalo_connected = true, zalo_user_id = 'zalo-an' where id = '00000000-0000-4000-8000-000000000002';
update system_settings set value = 'true' where key = 'zalo_enabled';
select private.schedule_end_of_day_summaries(pg_temp.at('19:35'));
select ok(
  pg_temp.body('00000000-0000-4000-8000-000000000002', 'ZALO') is not null
    and pg_temp.body('00000000-0000-4000-8000-000000000002', 'ZALO') = pg_temp.body('00000000-0000-4000-8000-000000000002'),
  'a linked member gets the same summary once in the app and once on Zalo'
);

select * from finish();
rollback;
