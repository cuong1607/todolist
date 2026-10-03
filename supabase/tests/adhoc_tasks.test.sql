-- Ad-hoc tasks: derived status, insert guard, carry-over. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

-- Fixtures inserted as postgres (bypasses guards) for An.
insert into tasks (id, type, assignee_id, task_date, title, due_at, status, completed_at) values
  ('10000000-0000-4000-8000-000000000001', 'ADHOC', '00000000-0000-4000-8000-000000000002', private.today_local(), 'overdue', now() - interval '1 minute', 'TODO', null),
  ('10000000-0000-4000-8000-000000000002', 'ADHOC', '00000000-0000-4000-8000-000000000002', private.today_local(), 'no deadline', null, 'TODO', null),
  ('10000000-0000-4000-8000-000000000003', 'ADHOC', '00000000-0000-4000-8000-000000000002', private.today_local(), 'tomorrow',
     ((private.today_local() + 1) + time '12:00') at time zone private.app_timezone(), 'TODO', null),
  ('10000000-0000-4000-8000-000000000004', 'ADHOC', '00000000-0000-4000-8000-000000000002', private.today_local(), 'done but late', now() - interval '1 day', 'DONE', now()),
  ('10000000-0000-4000-8000-000000000005', 'ADHOC', '00000000-0000-4000-8000-000000000002', '2020-01-01', 'old & no deadline', null, 'TODO', null),
  ('10000000-0000-4000-8000-000000000006', 'ADHOC', '00000000-0000-4000-8000-000000000002', private.today_local(), 'end of today',
     (private.today_local() + time '23:59:59') at time zone private.app_timezone(), 'TODO', null),
  ('10000000-0000-4000-8000-000000000007', 'ADHOC', '00000000-0000-4000-8000-000000000003', private.today_local(), 'binh task', null, 'TODO', null);

-- ---------- derived status ----------
create function pg_temp.st(p uuid) returns text language sql as $$ select display_status(t)::text from tasks t where id = p $$;

select is(pg_temp.st('10000000-0000-4000-8000-000000000001'), 'OVERDUE', 'deadline passed → OVERDUE');
select is(pg_temp.st('10000000-0000-4000-8000-000000000002'), 'TODAY', 'no deadline → TODAY (never overdue)');
select is(pg_temp.st('10000000-0000-4000-8000-000000000003'), 'UPCOMING', 'deadline tomorrow → UPCOMING');
select is(pg_temp.st('10000000-0000-4000-8000-000000000004'), 'COMPLETED', 'done wins over a past deadline → COMPLETED');
select is(pg_temp.st('10000000-0000-4000-8000-000000000005'), 'TODAY', 'old ad-hoc without deadline is still not overdue');
select is(pg_temp.st('10000000-0000-4000-8000-000000000006'), 'TODAY', 'deadline later today → TODAY');

insert into tasks (type, assignee_id, template_id, task_date, title)
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
  $$ select assignee_id, task_date, created_by, status::text from tasks where title = 'Quick create' $$,
  $$ values ('00000000-0000-4000-8000-000000000002'::uuid, private.today_local(), '00000000-0000-4000-8000-000000000002'::uuid, 'TODO') $$,
  'assignee / date / creator come from the session, not the client'
);

select throws_ok(
  $$ insert into tasks (type, title, assignee_id) values ('ADHOC', 'For Bình', '00000000-0000-4000-8000-000000000003') $$,
  '42501', 'Chỉ được tạo công việc cho chính mình',
  'cannot create a task for someone else'
);
select throws_ok(
  $$ insert into tasks (type, title) values ('FIXED', 'Fake fixed') $$,
  '42501', null,
  'cannot create FIXED tasks'
);
select throws_ok(
  $$ insert into tasks (type, title, status, completed_at) values ('ADHOC', 'Pre-done', 'DONE', now()) $$,
  '42501', null,
  'cannot create an already-completed task'
);

select lives_ok(
  $$ insert into tasks (type, title, task_date) values ('ADHOC', 'Backdated', '2020-01-01') $$,
  'client-sent task_date is accepted but ignored'
);
select is(
  (select task_date from tasks where title = 'Backdated'),
  private.today_local(),
  'task_date is forced to today'
);

-- Carry-over: a task created long ago is still editable/completable by its owner.
select lives_ok(
  $$ update tasks set title = 'old, renamed', due_at = now() + interval '2 days', note = 'rescheduled'
     where id = '10000000-0000-4000-8000-000000000005' $$,
  'owner can edit and reschedule a carried-over task'
);
update tasks set status = 'DONE' where id = '10000000-0000-4000-8000-000000000005';
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
