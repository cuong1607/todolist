-- Ad-hoc tasks: derived status, insert guard, carry-over. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

-- Fixtures inserted as postgres (bypasses guards) for An. ADHOC rows have no task_date.
insert into tasks (id, type, assignee_id, title, deadline_at, completed, completed_at, created_at) values
  ('10000000-0000-4000-8000-000000000001', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'overdue', now() - interval '1 minute', false, null, now()),
  ('10000000-0000-4000-8000-000000000002', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'no deadline', null, false, null, now()),
  ('10000000-0000-4000-8000-000000000003', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'tomorrow',
     ((private.today_local() + 1) + time '12:00') at time zone private.app_timezone(), false, null, now()),
  ('10000000-0000-4000-8000-000000000004', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'done but late', now() - interval '1 day', true, now(), now()),
  ('10000000-0000-4000-8000-000000000005', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'old & no deadline', null, false, null, '2020-01-01'),
  ('10000000-0000-4000-8000-000000000006', 'ADHOC', '00000000-0000-4000-8000-000000000002', 'end of today',
     (private.today_local() + time '23:59:59') at time zone private.app_timezone(), false, null, now()),
  ('10000000-0000-4000-8000-000000000007', 'ADHOC', '00000000-0000-4000-8000-000000000003', 'binh task', null, false, null, now());

-- ---------- derived status ----------
create function pg_temp.st(p uuid) returns text language sql as $$ select display_status(t)::text from tasks t where id = p $$;

select is(pg_temp.st('10000000-0000-4000-8000-000000000001'), 'OVERDUE', 'deadline passed → OVERDUE');
select is(pg_temp.st('10000000-0000-4000-8000-000000000002'), 'TODAY', 'no deadline → TODAY (never overdue)');
select is(pg_temp.st('10000000-0000-4000-8000-000000000003'), 'UPCOMING', 'deadline tomorrow → UPCOMING');
select is(pg_temp.st('10000000-0000-4000-8000-000000000004'), 'COMPLETED', 'done wins over a past deadline → COMPLETED');
select is(pg_temp.st('10000000-0000-4000-8000-000000000005'), 'TODAY', 'old ad-hoc without deadline is still not overdue');
select is(pg_temp.st('10000000-0000-4000-8000-000000000006'), 'TODAY', 'deadline later today → TODAY');

insert into tasks (type, assignee_id, fixed_template_id, task_date, title)
select 'FIXED', '00000000-0000-4000-8000-000000000002', id, '2020-01-02', 'missed fixed'
from fixed_task_templates where assignee_id = '00000000-0000-4000-8000-000000000002' limit 1;
select is(
  (select display_status(t)::text from tasks t where title = 'missed fixed'),
  'OVERDUE',
  'unfinished FIXED task from a past day → OVERDUE'
);

-- ---------- as An (authenticated) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok(
  $$ insert into tasks (type, title) values ('ADHOC', 'Quick create') $$,
  'employee creates an ad-hoc task with just a title'
);
select results_eq(
  $$ select assignee_id, task_date, created_by, completed from tasks where title = 'Quick create' $$,
  $$ values ('00000000-0000-4000-8000-000000000002'::uuid, null::date, '00000000-0000-4000-8000-000000000002'::uuid, false) $$,
  'assignee / creator come from the session; ad-hoc has no task_date'
);

select throws_ok(
  $$ insert into tasks (type, title, assignee_id) values ('ADHOC', 'For Bình', '00000000-0000-4000-8000-000000000003') $$,
  '42501', 'Chỉ được tạo công việc cho chính mình',
  'cannot create a task for someone else'
);
select throws_ok(
  $$ insert into tasks (type, title, task_date) values ('FIXED', 'Fake fixed', current_date) $$,
  '42501', null,
  'cannot create FIXED tasks'
);
select throws_ok(
  $$ insert into tasks (type, title, completed, completed_at) values ('ADHOC', 'Pre-done', true, now()) $$,
  '42501', null,
  'cannot create an already-completed task'
);

select lives_ok(
  $$ insert into tasks (type, title, task_date) values ('ADHOC', 'Backdated', '2020-01-01') $$,
  'client-sent task_date is accepted but ignored'
);
select is(
  (select task_date from tasks where title = 'Backdated'),
  null,
  'task_date is forced to null for ad-hoc'
);

-- Carry-over: a task created long ago is still editable/completable by its owner.
select lives_ok(
  $$ update tasks set title = 'old, renamed', deadline_at = now() + interval '2 days', note = 'rescheduled'
     where id = '10000000-0000-4000-8000-000000000005' $$,
  'owner can edit and reschedule a carried-over task'
);
update tasks set completed = true where id = '10000000-0000-4000-8000-000000000005';
select is(pg_temp.st('10000000-0000-4000-8000-000000000005'), 'COMPLETED', 'owner can complete a carried-over task');

-- RLS hides Bình's task, so the update silently matches nothing.
update tasks set title = 'hacked' where id = '10000000-0000-4000-8000-000000000007';
reset role;
select is(
  (select title from tasks where id = '10000000-0000-4000-8000-000000000007'),
  'binh task',
  'cannot edit another employee''s ad-hoc task'
);

select * from finish();
rollback;
