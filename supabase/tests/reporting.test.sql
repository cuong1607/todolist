-- Phase 8 reporting: metric definitions, daily series, RLS. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

-- Fixtures for An in the week of 2020-01-06 (local = UTC+7) so seed data never interferes.
insert into tasks (type, assignee_id, fixed_template_id, task_date, title, completed, completed_at)
select 'FIXED', '00000000-0000-4000-8000-000000000002', id, d.task_date, d.title, d.completed, d.completed_at
from (select id from fixed_task_templates where assignee_id = '00000000-0000-4000-8000-000000000002' order by sort_order limit 1) tpl,
     (values ('2020-01-06'::date, 'fixed done', true, '2020-01-06 03:00+00'::timestamptz),
             ('2020-01-07'::date, 'fixed missed', false, null)) d(task_date, title, completed, completed_at);

insert into tasks (type, assignee_id, title, created_at, deadline_at, completed, completed_at) values
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'A on time',            '2020-01-06 02:00+00', '2020-01-08 05:00+00', true,  '2020-01-08 04:00+00'),
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'B done late',          '2020-01-06 02:00+00', '2020-01-07 05:00+00', true,  '2020-01-09 04:00+00'),
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'C done, no deadline',  '2020-01-06 02:00+00', null,                  true,  '2020-01-10 04:00+00'),
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'D open, overdue',      '2020-01-06 02:00+00', '2020-01-09 05:00+00', false, null),
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'E open, no deadline',  '2020-01-06 02:00+00', null,                  false, null),
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'F old, overdue',       '2019-12-30 02:00+00', '2019-12-31 05:00+00', false, null),
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'G finished after range', '2020-01-08 02:00+00', '2020-01-15 05:00+00', true, '2020-01-20 04:00+00');

-- ---------- summary ----------
select results_eq(
  $$ select fixed_expected, fixed_completed, fixed_missed,
            adhoc_created, adhoc_completed, adhoc_on_time, adhoc_outstanding, adhoc_overdue
     from report_summary('2020-01-06', '2020-01-12') where assignee_id = '00000000-0000-4000-8000-000000000002' $$,
  $$ values (2, 1, 1, 6, 3, 2, 4, 2) $$,
  'fixed expected/completed/missed and ad-hoc created/completed/on-time/outstanding/overdue'
);

-- ---------- daily series ----------
select results_eq(
  $$ select fixed_expected, fixed_completed, fixed_missed, adhoc_created, adhoc_completed, adhoc_overdue
     from report_daily('2020-01-06', '2020-01-12') where day = '2020-01-07' $$,
  $$ values (1, 0, 1, 0, 0, 2) $$,
  'a day: missed fixed task; overdue snapshot counts tasks open and late at the end of that day (B, F)'
);
select results_eq(
  $$ select adhoc_created, adhoc_completed, adhoc_overdue
     from report_daily('2020-01-06', '2020-01-12') where day = '2020-01-08' $$,
  $$ values (1, 1, 2) $$,
  'created/completed are bucketed by local day'
);
select is(
  (select count(*)::integer from report_daily('2020-01-06', '2020-01-12')),
  7,
  'one row per day, including days without tasks'
);
select is(
  (select count(*)::integer from report_daily(private.today_local(), private.today_local() + 5)),
  1,
  'days after today are left out'
);

-- ---------- RLS ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::integer from report_summary('2020-01-06', '2020-01-12') where assignee_id = '00000000-0000-4000-8000-000000000002'),
  0,
  'an employee never sees another member''s numbers'
);

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select fixed_expected from report_summary('2020-01-06', '2020-01-12') where assignee_id = '00000000-0000-4000-8000-000000000002'),
  2,
  'admin sees every member'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from report_summary('2020-01-06', '2020-01-12') $$,
  '42501',
  null,
  'anon cannot call report_summary'
);

select * from finish();
rollback;
