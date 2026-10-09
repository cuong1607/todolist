-- Assigning ad-hoc tasks to another member: insert rules, who can read, who can change.
-- Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(19);

-- An = …002, Bình = …003, Cường = …005 (deactivated for this test).
update profiles set active = false where id = '00000000-0000-4000-8000-000000000005';

insert into tasks (id, type, assignee_id, created_by, title) values
  ('20000000-0000-4000-8000-000000000001', 'ADHOC', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'binh private');

select ok(not has_function_privilege('anon', 'public.team_members()', 'execute'), 'anon cannot list team members');

-- ---------- as An ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select count(*) from team_members()), 5::bigint, 'an employee can list the team by name');
select is(
  (select active from team_members() where id = '00000000-0000-4000-8000-000000000005'),
  false,
  'inactive members are flagged, so pickers can leave them out'
);

select lives_ok(
  $$ insert into tasks (id, type, title, assignee_id, deadline_at)
     values ('20000000-0000-4000-8000-000000000002', 'ADHOC', 'For Bình', '00000000-0000-4000-8000-000000000003', now() + interval '1 day') $$,
  'employee creates an ad-hoc task for another active member'
);
select results_eq(
  $$ select assignee_id, created_by from tasks where id = '20000000-0000-4000-8000-000000000002' $$,
  $$ values ('00000000-0000-4000-8000-000000000003'::uuid, '00000000-0000-4000-8000-000000000002'::uuid) $$,
  'assignee is the chosen member, creator is the session user (and the creator can read it back)'
);

select lives_ok(
  $$ insert into tasks (id, type, title, assignee_id, created_by)
     values ('20000000-0000-4000-8000-000000000003', 'ADHOC', 'Forged creator', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003') $$,
  'a client-sent created_by is accepted but ignored'
);
select is(
  (select created_by from tasks where id = '20000000-0000-4000-8000-000000000003'),
  '00000000-0000-4000-8000-000000000002'::uuid,
  'created_by always comes from the session'
);

select throws_ok(
  $$ insert into tasks (type, title, assignee_id) values ('ADHOC', 'For inactive', '00000000-0000-4000-8000-000000000005') $$,
  '42501', 'Người nhận không tồn tại hoặc đã ngừng hoạt động',
  'cannot assign to an inactive member'
);
select throws_ok(
  $$ insert into tasks (type, title, assignee_id) values ('ADHOC', 'For nobody', '99999999-0000-4000-8000-000000000000') $$,
  '42501', null,
  'cannot assign to someone who does not exist'
);
select throws_ok(
  $$ insert into tasks (type, title, assignee_id, task_date) values ('FIXED', 'Fixed for Bình', '00000000-0000-4000-8000-000000000003', current_date) $$,
  '42501', null,
  'FIXED tasks still cannot be created by members'
);

select is(
  (select count(*) from tasks where id = '20000000-0000-4000-8000-000000000001'),
  0::bigint,
  'the creator of one task does not see the assignee''s other tasks'
);
select is(
  (select count(*) from tasks where assignee_id = '00000000-0000-4000-8000-000000000003' and created_by is distinct from '00000000-0000-4000-8000-000000000002'),
  0::bigint,
  'nothing of Bình''s is visible to An except what An created'
);

-- Reading is all the creator gets: RLS leaves the row out of UPDATE, so nothing changes.
update tasks set title = 'changed by creator', completed = true where id = '20000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select title, completed from tasks where id = '20000000-0000-4000-8000-000000000002' $$,
  $$ values ('For Bình', false) $$,
  'the creator cannot edit or complete a task that is someone else''s responsibility'
);

-- ---------- as Bình (the assignee) ----------
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*) from tasks where id = '20000000-0000-4000-8000-000000000002'),
  1::bigint,
  'the assignee sees the task'
);
select is(
  (select count(*) from tasks where assignee_id = '00000000-0000-4000-8000-000000000002'),
  0::bigint,
  'the assignee sees none of the creator''s own tasks'
);
select lives_ok(
  $$ update tasks set completed = true where id = '20000000-0000-4000-8000-000000000002' $$,
  'the assignee can complete it'
);
select throws_ok(
  $$ update tasks set created_by = '00000000-0000-4000-8000-000000000003' where id = '20000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'the assignee cannot take over created_by'
);

-- ---------- as Cường (inactive) ----------
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';

select is((select count(*) from team_members()), 0::bigint, 'an inactive member gets no team list');
select throws_ok(
  $$ insert into tasks (type, title, assignee_id) values ('ADHOC', 'From inactive', '00000000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'an inactive member cannot assign tasks'
);

reset role;
select * from finish();
rollback;
