-- transfer_task(): who may hand a task over, what it changes, and that there is no way around it.
-- Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(31);

-- Admin = …001, An = …002, Bình = …003, Cường = …005 (deactivated for this test).
update profiles set active = false where id = '00000000-0000-4000-8000-000000000005';

insert into tasks (id, type, assignee_id, created_by, title, note, deadline_at, completed, completed_at) values
  -- T1: admin gave it to An; already overdue.
  ('30000000-0000-4000-8000-000000000001', 'ADHOC', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
   'overdue', 'keep me', '2026-01-01 10:00+07', false, null),
  -- T2: An's own, completed.
  ('30000000-0000-4000-8000-000000000002', 'ADHOC', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002',
   'done', null, null, true, now()),
  -- T4: Bình's own — nothing to do with An.
  ('30000000-0000-4000-8000-000000000004', 'ADHOC', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003',
   'binh private', null, null, false, null),
  -- T5: An gave it to Bình.
  ('30000000-0000-4000-8000-000000000005', 'ADHOC', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002',
   'given to binh', null, null, false, null),
  -- T6: An's own, open.
  ('30000000-0000-4000-8000-000000000006', 'ADHOC', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002',
   'an own', null, null, false, null);

create function pg_temp.fixed_of_an() returns uuid language sql as $$
  select id from public.tasks
  where type = 'FIXED' and assignee_id = '00000000-0000-4000-8000-000000000002' and task_date = private.today_local()
  limit 1
$$;
grant execute on function pg_temp.fixed_of_an() to authenticated;

select ok(not has_function_privilege('anon', 'public.transfer_task(uuid, uuid)', 'execute'), 'anon cannot call transfer_task');

-- ---------- as An ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ update tasks set assignee_id = '00000000-0000-4000-8000-000000000003' where id = '30000000-0000-4000-8000-000000000006' $$,
  '42501', 'Không được phép sửa trường này',
  'assignee_id cannot be changed by a direct update, even on your own task'
);
select throws_ok(
  $$ select transfer_task('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003') $$,
  '42501', 'Việc đã xong — mở lại trước khi chuyển',
  'a completed task cannot be transferred'
);
select throws_ok(
  $$ select transfer_task(pg_temp.fixed_of_an(), '00000000-0000-4000-8000-000000000003') $$,
  '42501', 'Việc cố định không thể chuyển cho người khác',
  'a FIXED task cannot be transferred'
);
select throws_ok(
  $$ select transfer_task('30000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002') $$,
  '42501', 'Không tìm thấy công việc',
  'someone else''s unrelated task cannot be transferred (and looks like it does not exist)'
);
select throws_ok(
  $$ select transfer_task('99999999-0000-4000-8000-000000000000', '00000000-0000-4000-8000-000000000003') $$,
  '42501', 'Không tìm thấy công việc',
  'a task that does not exist'
);
select throws_ok(
  $$ select transfer_task('30000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000005') $$,
  '42501', 'Người nhận không tồn tại hoặc đã ngừng hoạt động',
  'cannot transfer to an inactive member'
);
select throws_ok(
  $$ select transfer_task('30000000-0000-4000-8000-000000000006', '99999999-0000-4000-8000-000000000000') $$,
  '42501', 'Người nhận không tồn tại hoặc đã ngừng hoạt động',
  'cannot transfer to someone who does not exist'
);
select throws_ok(
  $$ select transfer_task('30000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002') $$,
  '42501', 'Người này đang phụ trách công việc',
  'cannot transfer to the current assignee'
);

-- The assignee hands T1 (created by the admin, overdue) to Bình.
select is(
  (select assignee_id from transfer_task('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003')),
  '00000000-0000-4000-8000-000000000003'::uuid,
  'the assignee transfers their task'
);
select is(
  (select count(*) from tasks where id = '30000000-0000-4000-8000-000000000001'),
  0::bigint,
  'the previous assignee (not the creator) no longer sees it'
);
select throws_ok(
  $$ select transfer_task('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002') $$,
  '42501', 'Không tìm thấy công việc',
  '…and cannot take it back'
);

-- A reopened task can move.
update tasks set completed = false where id = '30000000-0000-4000-8000-000000000002';
select lives_ok(
  $$ select transfer_task('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003') $$,
  'once reopened, the task can be transferred'
);
select is(
  (select count(*) from tasks where id = '30000000-0000-4000-8000-000000000002'),
  1::bigint,
  'its creator still sees it after handing it over'
);
select is(
  (select count(*) from task_history where task_id = '30000000-0000-4000-8000-000000000002'),
  3::bigint,
  '…and its history (created, reopened, transferred)'
);

-- The creator moves a task they handed out (e.g. to the wrong person).
select lives_ok(
  $$ select transfer_task('30000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002') $$,
  'the creator can reassign a task they gave to someone else'
);
update tasks set title = 'hacked' where id = '30000000-0000-4000-8000-000000000004';

reset role;

select results_eq(
  $$ select assignee_id, created_by, deadline_at, note, display_status(t)::text
     from tasks t where id = '30000000-0000-4000-8000-000000000001' $$,
  $$ values ('00000000-0000-4000-8000-000000000003'::uuid, '00000000-0000-4000-8000-000000000001'::uuid,
             '2026-01-01 10:00+07'::timestamptz, 'keep me', 'OVERDUE') $$,
  'a transfer changes the assignee only: creator, deadline, note and overdue are untouched'
);
select results_eq(
  $$ select action::text, actor_id, old_data ->> 'assignee_id', new_data ->> 'assignee_id', (new_data - 'assignee_id')::text
     from task_history where task_id = '30000000-0000-4000-8000-000000000001' order by id desc limit 1 $$,
  $$ values ('TASK_TRANSFERRED', '00000000-0000-4000-8000-000000000002'::uuid, '00000000-0000-4000-8000-000000000002',
             '00000000-0000-4000-8000-000000000003', '{}') $$,
  'history: TASK_TRANSFERRED with who moved it, from whom, to whom — and nothing else changed'
);
select is(
  (select action::text from task_history where task_id = '30000000-0000-4000-8000-000000000005' order by id desc limit 1),
  'TASK_TRANSFERRED',
  'a creator (not an admin) reassigning is a TASK_TRANSFERRED too'
);
select is(
  (select action::text from task_history where task_id = '30000000-0000-4000-8000-000000000001' order by id limit 1),
  'TASK_ASSIGNED',
  'a task created for someone else starts with TASK_ASSIGNED, not CREATED'
);
select is(
  (select action::text from task_history where task_id = '30000000-0000-4000-8000-000000000006' order by id limit 1),
  'CREATED',
  'a task created for yourself still starts with CREATED'
);
select is(
  (select count(*) from task_history where task_id = '30000000-0000-4000-8000-000000000001'),
  2::bigint,
  'earlier history is kept (created + transferred)'
);
select is(
  (select title from tasks where id = '30000000-0000-4000-8000-000000000004'),
  'binh private',
  'an unrelated task is still out of reach for direct updates'
);

-- ---------- as Bình (now the assignee of T1) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*) from tasks where id = '30000000-0000-4000-8000-000000000001'),
  1::bigint,
  'the new assignee sees the task'
);
select is(
  (select count(*) from task_history where task_id = '30000000-0000-4000-8000-000000000001'),
  2::bigint,
  '…with its whole history'
);
select is(
  (select count(*) from tasks where id = '30000000-0000-4000-8000-000000000006'),
  0::bigint,
  'receiving a task exposes none of the sender''s other tasks'
);

-- ---------- as the admin ----------
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ update tasks set assignee_id = '00000000-0000-4000-8000-000000000002' where id = '30000000-0000-4000-8000-000000000004' $$,
  '42501', null,
  'even an admin cannot change assignee_id with a direct update'
);
select is(
  (select assignee_id from transfer_task('30000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002')),
  '00000000-0000-4000-8000-000000000002'::uuid,
  'an admin can transfer any ad-hoc task'
);
select is(
  (select action::text from task_history where task_id = '30000000-0000-4000-8000-000000000004' order by id desc limit 1),
  'TASK_REASSIGNED_BY_ADMIN',
  '…recorded as TASK_REASSIGNED_BY_ADMIN'
);
select throws_ok(
  $$ select transfer_task(pg_temp.fixed_of_an(), '00000000-0000-4000-8000-000000000003') $$,
  '42501', 'Việc cố định không thể chuyển cho người khác',
  '…but not a FIXED one'
);

-- ---------- as Cường (inactive) ----------
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ select transfer_task('30000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000003') $$,
  '42501', 'Cần đăng nhập',
  'an inactive member cannot transfer anything'
);

reset role;
select * from finish();
rollback;
