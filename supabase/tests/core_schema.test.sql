-- Phase 3 core schema: tables, indexes, constraints, history, RLS foundation. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(42);

-- ---------- tables & RLS ----------
select has_table('public', t, 'table ' || t || ' exists')
from unnest(array['profiles', 'fixed_task_templates', 'tasks', 'task_history',
                  'notification_settings', 'notification_logs', 'system_settings']) t;

select is(
  (select array_agg(relname::text order by relname) from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity),
  null,
  'RLS is enabled on every public table'
);

-- ---------- spec column names ----------
select has_column('fixed_task_templates', c, 'fixed_task_templates.' || c)
from unnest(array['default_note', 'days_of_week', 'effective_from', 'effective_to']) c;
select has_column('tasks', c, 'tasks.' || c)
from unnest(array['fixed_template_id', 'deadline_at', 'completed', 'task_date']) c;
select col_is_null('tasks', 'task_date', 'tasks.task_date is nullable (null for ADHOC)');

-- ---------- indexes required by the spec (leading column) ----------
select ok(
  exists (
    select 1 from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid = ('public.' || tbl)::regclass and a.attname = col
  ),
  format('index leading on %s.%s', tbl, col)
)
from (values ('tasks', 'assignee_id'), ('tasks', 'task_date'), ('tasks', 'deadline_at'),
             ('tasks', 'completed'), ('tasks', 'type'), ('fixed_task_templates', 'assignee_id')) v(tbl, col);

-- ---------- no duplicate fixed instances ----------
select ok(
  exists (select 1 from pg_constraint where conname = 'tasks_fixed_template_date_key' and contype = 'u'),
  'unique (fixed_template_id, task_date) exists'
);
select throws_ok(
  $$ insert into tasks (type, assignee_id, fixed_template_id, task_date, title)
     select 'FIXED', assignee_id, fixed_template_id, task_date, title from tasks where type = 'FIXED' limit 1 $$,
  '23505', null,
  'a second instance of the same template on the same day is rejected'
);
select throws_ok(
  $$ insert into tasks (type, assignee_id, title, task_date) values ('ADHOC', '00000000-0000-4000-8000-000000000002', 'x', current_date) $$,
  '23514', null,
  'ADHOC tasks cannot have a task_date'
);

-- ---------- effective dates ----------
insert into fixed_task_templates (assignee_id, title, days_of_week, effective_from, effective_to)
values ('00000000-0000-4000-8000-000000000002', 'Chỉ tuần đầu 2030', '{1,2,3,4,5,6,7}', '2030-01-01', '2030-01-07');
select private.generate_fixed_tasks('2029-12-31');
select ok(exists (select 1 from tasks where title = 'Chỉ tuần đầu 2030' and task_date = '2029-12-31') = false, 'nothing before effective_from');
select private.generate_fixed_tasks('2030-01-07');
select ok(exists (select 1 from tasks where title = 'Chỉ tuần đầu 2030' and task_date = '2030-01-07'), 'generated on effective_to (inclusive)');
select private.generate_fixed_tasks('2030-01-08');
select ok(not exists (select 1 from tasks where title = 'Chỉ tuần đầu 2030' and task_date = '2030-01-08'), 'not generated after effective_to');
select throws_ok(
  $$ insert into fixed_task_templates (assignee_id, title, effective_from, effective_to)
     values ('00000000-0000-4000-8000-000000000002', 'bad range', '2030-02-01', '2030-01-01') $$,
  '23514', null,
  'effective_to before effective_from is rejected'
);

-- ---------- task_history ----------
select ok(
  exists (select 1 from task_history h join tasks t on t.id = h.task_id
          where t.title = 'Chỉ tuần đầu 2030' and h.action = 'CREATED' and h.actor_id is null),
  'generator inserts are logged as CREATED by the system (actor null)'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';

insert into tasks (type, title) values ('ADHOC', 'Lịch sử test');
update tasks set deadline_at = now() + interval '1 day' where title = 'Lịch sử test';
update tasks set note = 'ghi chú' where title = 'Lịch sử test';
update tasks set completed = true where title = 'Lịch sử test';
update tasks set completed = false where title = 'Lịch sử test';

select results_eq(
  $$ select h.action::text from task_history h join tasks t on t.id = h.task_id
     where t.title = 'Lịch sử test' order by h.id $$,
  array['CREATED', 'RESCHEDULED', 'UPDATED', 'COMPLETED', 'REOPENED'],
  'every change is logged with the right action'
);
select ok(
  (select bool_and(h.actor_id = '00000000-0000-4000-8000-000000000002') from task_history h join tasks t on t.id = h.task_id where t.title = 'Lịch sử test'),
  'actor_id is the session user'
);
select is(
  (select h.new_data ? 'note' and not (h.new_data ? 'title') from task_history h join tasks t on t.id = h.task_id
   where t.title = 'Lịch sử test' and h.action = 'UPDATED'),
  true,
  'UPDATED stores only the changed fields'
);
select throws_ok(
  $$ insert into task_history (task_id, action) select id, 'UPDATED' from tasks where title = 'Lịch sử test' $$,
  '42501', null,
  'clients cannot write history directly'
);
select is(
  (select count(*)::int from task_history h join tasks t on t.id = h.task_id where t.assignee_id <> '00000000-0000-4000-8000-000000000002'),
  0,
  'employee cannot read history of other members'' tasks'
);

-- ---------- notification_settings / logs / system_settings ----------
select is((select count(*)::int from notification_settings), 1, 'employee sees only own notification settings');
select lives_ok($$ update notification_settings set remind_before_minutes = 60 $$, 'employee updates own notification settings');
select throws_ok(
  $$ insert into notification_logs (user_id, provider, type) values ('00000000-0000-4000-8000-000000000002', 'ZALO', 'NEW_TASK') $$,
  '42501', null,
  'clients cannot write notification logs'
);
select is((select value #>> '{}' from system_settings where key = 'team_name'), 'Team Todo', 'members can read system settings');
update system_settings set value = '"Hacked"' where key = 'team_name';
select is((select value #>> '{}' from system_settings where key = 'team_name'), 'Team Todo', 'employees cannot change system settings');

reset role;
select is(
  (select count(*)::int from profiles p left join notification_settings s on s.user_id = p.id where s.user_id is null),
  0,
  'every profile has a notification_settings row'
);

select * from finish();
rollback;
