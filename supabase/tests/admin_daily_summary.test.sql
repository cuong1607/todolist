-- Phase 14 admin daily summary: one short team message per admin, switchable, at the admin's time,
-- and never a member's personal notifications. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

-- The per-minute cron job may already have queued today's summaries; start from a known state.
delete from notification_logs;

create function pg_temp.at(p_time time) returns timestamptz language sql as
$$ select (private.today_local() + p_time) at time zone private.app_timezone() $$;
create function pg_temp.body(p_user uuid default '00000000-0000-4000-8000-000000000001') returns text language sql as
$$ select payload ->> 'body' from notification_logs where type = 'ADMIN_DAILY_SUMMARY' and provider = 'IN_APP' and user_id = p_user $$;
create function pg_temp.name(p_user uuid) returns text language sql as
$$ select full_name from profiles where id = p_user $$;

-- Seed: An has 3 fixed tasks today, an ad-hoc due today and one overdue since yesterday (5 that
-- count today; the no-deadline and upcoming ones do not). Bình has only fixed tasks. On top of that:
--   An    finishes one fixed task and one extra ad-hoc task today  → 2/6
--   Bình  gets an ad-hoc task that became overdue at 17:00          → 0/(fixed + 1)
update tasks set completed = true, completed_at = pg_temp.at('09:00')
where id = (select id from tasks where type = 'FIXED' and assignee_id = '00000000-0000-4000-8000-000000000002'
            and task_date = private.today_local() order by sort_order, id limit 1);
insert into tasks (type, assignee_id, title, deadline_at, completed, completed_at, created_at) values
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'an done today', pg_temp.at('15:00'), true, pg_temp.at('14:00'), pg_temp.at('08:00')),
  ('ADHOC', '00000000-0000-4000-8000-000000000003', 'binh late', pg_temp.at('17:00'), false, null, pg_temp.at('08:00'));

select is(private.setting_time('admin_daily_summary_time', '00:00'), time '18:10', 'the admin summary defaults to 18:10, after the members'' 18:00 summary');
select is(private.setting_bool('admin_daily_summary_enabled', false), true, '…and is switched on');

-- ---------- 18:10 by default ----------
select is(private.schedule_admin_daily_summaries(pg_temp.at('18:09')), 0, 'nothing before 18:10');
select is(private.schedule_admin_daily_summaries(pg_temp.at('18:10')), 2, 'one message per admin at 18:10');
select is(
  (select array_agg(user_id order by user_id) from notification_logs where type = 'ADMIN_DAILY_SUMMARY'),
  array['00000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000000000004'::uuid],
  'it goes to admins only'
);

-- ---------- content ----------
-- Team line: the same numbers as the dashboard (team_overview) for today.
select is(
  split_part(pg_temp.body(), E'\n', 1),
  (select 'Tổng ' || sum(o.fixed_total + o.adhoc_total) || ' · Xong ' || sum(o.fixed_done + o.adhoc_done)
     || ' · Còn ' || sum(o.fixed_total + o.adhoc_total - o.fixed_done - o.adhoc_done)
   from team_overview(private.today_local(), private.today_local()) o)
    || ' · Quá hạn ' || (select count(*) from tasks t
                        where private.task_in_range(t, private.today_local(), private.today_local())
                          and not t.completed and t.deadline_at < pg_temp.at('18:10')),
  'first line: total · completed · outstanding · overdue for the team today'
);
select ok(
  pg_temp.body() like '%' || E'\n' || pg_temp.name('00000000-0000-4000-8000-000000000002') || ' 2/6%',
  'An''s line: completed/total'
);
select ok(
  pg_temp.body() like '%' || E'\n' || pg_temp.name('00000000-0000-4000-8000-000000000003') || ' 0/'
    || (select count(*) + 1 from tasks where assignee_id = '00000000-0000-4000-8000-000000000003' and type = 'FIXED' and task_date = private.today_local()) || '%',
  'Bình''s line: completed/total'
);
select is(
  array_length(string_to_array(pg_temp.body(), E'\n'), 1),
  1 + (select count(*)::integer from team_overview(private.today_local(), private.today_local())),
  'short: one team line plus one line per member with work today'
);
select results_eq(
  $$ select count(*)::integer, count(task_id)::integer, max(payload ->> 'title'), max(payload ->> 'url'), max(scheduled_at)
     from notification_logs where type = 'ADMIN_DAILY_SUMMARY' and user_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (1, 0, 'Tổng kết team hôm nay', '/overview', pg_temp.at('18:10')) $$,
  'one combined message per admin, linking to the dashboard'
);
select is(private.schedule_admin_daily_summaries(pg_temp.at('18:40')), 0, 'running again the same evening sends nothing twice');

-- ---------- admins do not receive the members' personal notifications ----------
select private.schedule_notifications(pg_temp.at('18:15'));
select is(
  (select count(*)::integer from notification_logs n join tasks t on t.id = n.task_id where n.user_id <> t.assignee_id),
  0,
  'every per-task notification goes to its assignee only — none to an admin'
);

-- ---------- admin settings: on/off and time ----------
delete from notification_logs;
update system_settings set value = 'false' where key = 'admin_daily_summary_enabled';
select is(private.schedule_admin_daily_summaries(pg_temp.at('18:15')), 0, 'switched off: nothing is sent');
update system_settings set value = 'true' where key = 'admin_daily_summary_enabled';

update system_settings set value = '"19:00"' where key = 'admin_daily_summary_time';
select is(private.schedule_admin_daily_summaries(pg_temp.at('18:15')), 0, 'after the admin moves it to 19:00, nothing goes out at 18:15');
select is(private.schedule_admin_daily_summaries(pg_temp.at('19:05')), 2, '…and it goes out at the new time');
select is(
  (select scheduled_at from notification_logs where type = 'ADMIN_DAILY_SUMMARY' and user_id = '00000000-0000-4000-8000-000000000001'),
  pg_temp.at('19:00'),
  'scheduled for the configured time'
);

-- ---------- an admin who muted notifications ----------
delete from notification_logs;
update profiles set notification_enabled = false where id = '00000000-0000-4000-8000-000000000004';
select is(private.schedule_admin_daily_summaries(pg_temp.at('19:05')), 1, 'an admin who turned notifications off is skipped');

select * from finish();
rollback;
