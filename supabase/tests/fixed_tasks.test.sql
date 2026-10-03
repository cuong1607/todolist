-- Daily generation of FIXED tasks. Run: npm run test:db
-- Uses dates far in the future so it never collides with seed data, and rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

-- Seed: An has 3 daily templates; Bình has 1 daily + 1 on Mon/Wed/Fri.
-- 2030-01-07 is a Monday, 2030-01-08 a Tuesday, 2030-01-12 a Saturday.

-- ---------- schedule ----------
select is(
  (select schedule from cron.job where jobname = 'generate-fixed-tasks'),
  '5 17 * * *',
  'cron runs at 17:05 UTC = 00:05 Asia/Bangkok'
);
select is(private.app_timezone(), 'Asia/Bangkok', 'app timezone is Asia/Bangkok');

-- ---------- generation + idempotency ----------
select is(private.generate_fixed_tasks('2030-01-07'), 5, 'Monday: generates all applicable templates');
select is(private.generate_fixed_tasks('2030-01-07'), 0, 'second run for same day inserts nothing');
select is(private.generate_fixed_tasks('2030-01-07'), 0, 'third run for same day inserts nothing');
select is((select count(*)::int from tasks where task_date = '2030-01-07'), 5, 'still exactly 5 tasks — no duplicates');
select is(private.generate_fixed_tasks('2030-01-08'), 4, 'Tuesday: Mon/Wed/Fri template is skipped');

select ok(
  (select bool_and(type = 'FIXED' and status = 'TODO' and template_id is not null) from tasks where task_date = '2030-01-07'),
  'generated tasks are FIXED / TODO / linked to template'
);

-- due_time is local (Asia/Bangkok, UTC+7): 09:00 local = 02:00 UTC
select is(
  (select due_at from tasks where task_date = '2030-01-07' and title = 'Kiểm tra đơn hàng mới'),
  '2030-01-07 02:00:00+00'::timestamptz,
  'due_at = task_date + due_time in Asia/Bangkok'
);

-- ---------- snapshot: editing a template never rewrites history ----------
update fixed_task_templates set title = 'Tiêu đề mới', note = 'Ghi chú mới' where title = 'Kiểm tra đơn hàng mới';
select is(
  (select title from tasks where task_date = '2030-01-07' and template_id = (select id from fixed_task_templates where title = 'Tiêu đề mới')),
  'Kiểm tra đơn hàng mới',
  'existing task keeps its title snapshot after template edit'
);
select is(private.generate_fixed_tasks('2030-01-09'), 5, 'Wednesday generates with the new title');
select ok(exists (select 1 from tasks where task_date = '2030-01-09' and title = 'Tiêu đề mới'), 'new day uses updated template');

-- ---------- disabled templates / inactive members ----------
update fixed_task_templates set active = false where title = 'Tiêu đề mới';
update profiles set active = false where email = 'binh@team.local';
select is(private.generate_fixed_tasks('2030-01-10'), 2, 'skips disabled template and inactive member');

-- ---------- default weekdays exclude weekend ----------
insert into fixed_task_templates (assignee_id, title)
values ('00000000-0000-4000-8000-000000000002', 'Việc ngày thường');
select ok(
  not exists (select 1 from tasks where title = 'Việc ngày thường' and task_date = '2030-01-12')
  and private.generate_fixed_tasks('2030-01-12') = 2,
  'default Mon–Fri template is not generated on Saturday'
);

-- ---------- no hard delete once a template has generated tasks ----------
select throws_ok(
  $$ delete from fixed_task_templates where title = 'Tiêu đề mới' $$,
  '23503',
  null,
  'cannot hard-delete a template that generated tasks'
);
select lives_ok(
  $$ delete from fixed_task_templates where title = 'Việc ngày thường' $$,
  'can delete a template that never generated tasks'
);

select * from finish();
rollback;
