-- Phase 7 admin dashboard: range scoping, aggregates, RLS. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

-- Fixtures in a week of January 2020 so seed data never interferes. Inserted as postgres (bypasses guards).
insert into tasks (type, assignee_id, fixed_template_id, task_date, title, completed, completed_at)
select 'FIXED', '00000000-0000-4000-8000-000000000002', id, d.task_date, d.title, d.completed, d.completed_at
from (select id from fixed_task_templates where assignee_id = '00000000-0000-4000-8000-000000000002' order by sort_order limit 1) tpl,
     (values ('2020-01-06'::date, 'fixed done', true, '2020-01-06 03:00+00'::timestamptz),
             ('2020-01-07'::date, 'fixed missed', false, null)) d(task_date, title, completed, completed_at);

insert into tasks (type, assignee_id, title, deadline_at, completed, completed_at, created_at) values
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'due in range, done', '2020-01-08 05:00+00', true, '2020-01-08 04:00+00', '2020-01-06'),
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'due in range, open', '2020-01-09 05:00+00', false, null, '2020-01-06'),
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'no deadline, done in range', null, true, '2020-01-10 04:00+00', '2020-01-06'),
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'no deadline, open', null, false, null, '2020-01-06'),
  ('ADHOC', '00000000-0000-4000-8000-000000000002', 'late before range', '2019-12-31 05:00+00', false, null, '2019-12-30'),
  ('ADHOC', '00000000-0000-4000-8000-000000000003', 'binh done in range', null, true, '2020-01-08 04:00+00', '2020-01-06'),
  ('ADHOC', '00000000-0000-4000-8000-000000000003', 'binh carried over', '2019-12-31 05:00+00', false, null, '2019-12-30');

-- ---------- scoping + aggregates ----------
select results_eq(
  $$ select fixed_total, fixed_done, adhoc_total, adhoc_done, overdue
     from team_overview('2020-01-06', '2020-01-12') where assignee_id = '00000000-0000-4000-8000-000000000002' $$,
  $$ values (2, 1, 3, 2, 2) $$,
  'counts fixed instances, ad-hoc due or done in range; backlog and out-of-range tasks are left out'
);
select is(
  (select count(*)::integer from tasks_in_range('00000000-0000-4000-8000-000000000002', '2020-01-06', '2020-01-12')),
  5,
  'tasks_in_range returns exactly the rows behind the counts'
);
select results_eq(
  $$ select adhoc_total, adhoc_done from team_overview(private.today_local(), private.today_local())
     where assignee_id = '00000000-0000-4000-8000-000000000003' $$,
  $$ values (1, 0) $$,
  'an open, already-late ad-hoc task is carried into a range that covers today'
);
select is(
  (select count(*)::integer from team_overview('2020-01-06', '2020-01-12')),
  2,
  'one row per member with tasks in range'
);

-- ---------- RLS: employee sees only own numbers ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select results_eq(
  $$ select assignee_id from team_overview('2020-01-06', '2020-01-12') $$,
  $$ values ('00000000-0000-4000-8000-000000000002'::uuid) $$,
  'employee calling team_overview gets only their own row'
);
select is(
  (select count(*)::integer from tasks_in_range('00000000-0000-4000-8000-000000000003', '2020-01-06', '2020-01-12')),
  0,
  'employee cannot list another member''s tasks'
);

-- ---------- admin sees the team ----------
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::integer from team_overview('2020-01-06', '2020-01-12')),
  2,
  'admin gets every member'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from team_overview('2020-01-06', '2020-01-12') $$,
  '42501',
  null,
  'anon cannot call team_overview'
);

select * from finish();
rollback;
