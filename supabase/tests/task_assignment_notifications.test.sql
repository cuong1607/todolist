-- TASK_ASSIGNED / TASK_TRANSFERRED: who is told, what the message says, no duplicates, and the
-- daily summaries following the current assignee. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(31);

-- Admin = …001, An = …002, Bình = …003, Cường = …005.
-- The per-minute cron job may already have queued rows; start from a known state.
delete from notification_logs;

-- Bình is reachable on Zalo; nobody else is.
update system_settings set value = 'true' where key = 'zalo_enabled';
update profiles set zalo_user_id = 'zalo-binh', zalo_connected = true where id = '00000000-0000-4000-8000-000000000003';

create function pg_temp.at(p_days integer, p_time time) returns timestamptz language sql as
$$ select ((private.today_local() + p_days) + p_time) at time zone private.app_timezone() $$;
create function pg_temp.sent(p_user uuid, p_type text, p_provider text default 'IN_APP') returns bigint language sql as
$$ select count(*) from notification_logs where user_id = p_user and type::text = p_type and provider::text = p_provider $$;
create function pg_temp.body(p_task uuid, p_user uuid, p_type text) returns text language sql as
$$ select payload ->> 'body' from notification_logs
   where task_id = p_task and user_id = p_user and type::text = p_type and provider = 'IN_APP' order by id desc limit 1 $$;
grant execute on function pg_temp.at(integer, time) to authenticated;

-- Where the summaries stand before anything is assigned (day +10: nothing in the seed is due then).
create temp table before_counts as
select p.id,
  (select due_n from private.morning_summary_counts(p.id, private.today_local() + 10)) as due_n,
  (select adhoc_open from private.end_of_day_counts(p.id, private.today_local() + 10, pg_temp.at(10, '18:00'))) as open_n
from profiles p;

-- ============================================================
-- Assign: An creates tasks
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into tasks (id, type, title, assignee_id, deadline_at) values
  ('40000000-0000-4000-8000-000000000001', 'ADHOC', 'Gửi báo giá khách ABC', '00000000-0000-4000-8000-000000000003', pg_temp.at(10, '16:00')),
  ('40000000-0000-4000-8000-000000000002', 'ADHOC', 'Việc của An', '00000000-0000-4000-8000-000000000002', null),
  ('40000000-0000-4000-8000-000000000003', 'ADHOC', 'Không hạn', '00000000-0000-4000-8000-000000000003', null),
  ('40000000-0000-4000-8000-000000000004', 'ADHOC', 'Hạn theo ngày', '00000000-0000-4000-8000-000000000003', pg_temp.at(1, '23:59'));
reset role;

select is(pg_temp.sent('00000000-0000-4000-8000-000000000003', 'TASK_ASSIGNED'), 3::bigint, 'the assignee gets one TASK_ASSIGNED per task given to them');
select is(
  (select payload ->> 'title' from notification_logs where task_id = '40000000-0000-4000-8000-000000000001' and provider = 'IN_APP'),
  'Bạn có công việc mới',
  'TASK_ASSIGNED title'
);
select is(
  pg_temp.body('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'TASK_ASSIGNED'),
  E'Gửi báo giá khách ABC\nHạn: ' || to_char(private.today_local() + 10, 'DD/MM') || E' - 16:00\nNgười giao: Nguyễn Văn An',
  'TASK_ASSIGNED body: task, deadline, who gave it'
);
select is(
  pg_temp.body('40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'TASK_ASSIGNED'),
  E'Không hạn\nNgười giao: Nguyễn Văn An',
  'no deadline → no “Hạn” line'
);
select is(
  pg_temp.body('40000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', 'TASK_ASSIGNED'),
  E'Hạn theo ngày\nHạn: ' || to_char(private.today_local() + 1, 'DD/MM') || E'\nNgười giao: Nguyễn Văn An',
  'a date-only deadline shows the date alone'
);
select is(
  (select payload ->> 'url' from notification_logs where task_id = '40000000-0000-4000-8000-000000000001' and provider = 'IN_APP'),
  '/today',
  'the message links to the Today screen'
);
select is(pg_temp.sent('00000000-0000-4000-8000-000000000003', 'TASK_ASSIGNED', 'ZALO'), 3::bigint, 'a member linked to Zalo also gets it there');
select is(
  (select count(*) from notification_logs where user_id = '00000000-0000-4000-8000-000000000002'),
  0::bigint,
  'the creator is not notified — neither for tasks given away nor for their own'
);
select is(
  (select count(*) from notification_logs where task_id = '40000000-0000-4000-8000-000000000002'),
  0::bigint,
  'a task created for yourself notifies nobody'
);

-- ============================================================
-- Transfer
-- ============================================================
-- Bình hands the task to Cường.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select transfer_task('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005');
reset role;

select is(pg_temp.sent('00000000-0000-4000-8000-000000000005', 'TASK_TRANSFERRED'), 1::bigint, 'the new assignee gets one TASK_TRANSFERRED');
select is(
  (select payload ->> 'title' from notification_logs where user_id = '00000000-0000-4000-8000-000000000005' and provider = 'IN_APP'),
  'Bạn vừa nhận một công việc',
  'TASK_TRANSFERRED title'
);
select is(
  pg_temp.body('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', 'TASK_TRANSFERRED'),
  E'Gửi báo giá khách ABC\nChuyển từ: Trần Thị Bình\nHạn: ' || to_char(private.today_local() + 10, 'DD/MM') || ' - 16:00',
  'TASK_TRANSFERRED body: task, who had it, the unchanged deadline'
);
select is(pg_temp.sent('00000000-0000-4000-8000-000000000005', 'TASK_TRANSFERRED', 'ZALO'), 0::bigint, 'a member not linked to Zalo gets no Zalo row');
select is(
  (select count(*) from notification_logs where type = 'TASK_TRANSFERRED' and user_id <> '00000000-0000-4000-8000-000000000005'),
  0::bigint,
  'only the new assignee is told — not the sender, not the creator'
);

-- The creator takes the task back: no message to themselves.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select transfer_task('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
reset role;
select is(pg_temp.sent('00000000-0000-4000-8000-000000000002', 'TASK_TRANSFERRED'), 0::bigint, 'taking a task yourself sends you nothing');

-- …and gives it to Cường again: a new transfer, a new message.
set local role authenticated;
select transfer_task('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select transfer_task('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005') $$,
  '42501', 'Người này đang phụ trách công việc',
  'a retried transfer is rejected before anything is written'
);
reset role;
select is(pg_temp.sent('00000000-0000-4000-8000-000000000005', 'TASK_TRANSFERRED'), 2::bigint, 'a second, real transfer is announced once; the retry added nothing');
select is(
  private.enqueue_notification(
    '00000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001', 'TASK_TRANSFERRED',
    (select dedupe_key from notification_logs where user_id = '00000000-0000-4000-8000-000000000005' order by id desc limit 1),
    now(), '{"title":"dup","body":"dup"}'::jsonb),
  0,
  'replaying the same event is dropped by the dedupe key'
);

-- An admin moves Bình's task to An: An hears it came from Bình; the admin hears nothing.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select transfer_task('40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002');
reset role;
select is(
  pg_temp.body('40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'TASK_TRANSFERRED'),
  E'Không hạn\nChuyển từ: Trần Thị Bình',
  'reassigned by an admin: the receiver is told whose task it was'
);
select is(
  (select count(*) from notification_logs where user_id = '00000000-0000-4000-8000-000000000001'),
  0::bigint,
  'the admin who moved it is not notified'
);

-- The member's master switch.
update profiles set notification_enabled = false where id = '00000000-0000-4000-8000-000000000005';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select transfer_task('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005');
reset role;
select is(
  (select count(*) from notification_logs where task_id = '40000000-0000-4000-8000-000000000002'),
  0::bigint,
  'a member who switched notifications off is not notified'
);
update profiles set notification_enabled = true where id = '00000000-0000-4000-8000-000000000005';

-- FIXED tasks are outside this workflow.
select private.generate_fixed_tasks(private.today_local() + 1);
select is(
  (select count(*) from notification_logs n join tasks t on t.id = n.task_id
   where t.type = 'FIXED' and n.type in ('TASK_ASSIGNED', 'TASK_TRANSFERRED')),
  0::bigint,
  'generating fixed tasks sends no assignment notifications'
);

-- ============================================================
-- Delivery goes through the engine: a Zalo failure is logged, in-app still arrives
-- ============================================================
select claim_notifications('ZALO', 100);
select fail_notification(
  (select id from notification_logs where task_id = '40000000-0000-4000-8000-000000000001' and provider = 'ZALO'),
  'Zalo từ chối', true);
select results_eq(
  $$ select status::text, error, failed_at is not null from notification_logs
     where task_id = '40000000-0000-4000-8000-000000000001' and provider = 'ZALO' $$,
  $$ values ('FAILED', 'Zalo từ chối', true) $$,
  'a failed Zalo send is recorded on the notification log row'
);
select private.deliver_in_app();
select is(
  (select status::text from notification_logs
   where task_id = '40000000-0000-4000-8000-000000000001' and provider = 'IN_APP' and type = 'TASK_ASSIGNED'),
  'SENT',
  '…and the in-app copy is delivered regardless'
);

-- ============================================================
-- Summaries follow the current assignee, never the creator
-- ============================================================
create function pg_temp.due_delta(p_user uuid) returns integer language sql as
$$ select (select due_n from private.morning_summary_counts(p_user, private.today_local() + 10)) - b.due_n
   from before_counts b where b.id = p_user $$;
create function pg_temp.open_delta(p_user uuid) returns integer language sql as
$$ select (select adhoc_open from private.end_of_day_counts(p_user, private.today_local() + 10, pg_temp.at(10, '18:00'))) - b.open_n
   from before_counts b where b.id = p_user $$;

-- An creates a task for Bình, due on day +10.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into tasks (id, type, title, assignee_id, deadline_at) values
  ('40000000-0000-4000-8000-000000000005', 'ADHOC', 'Kiểm tra hợp đồng ABC', '00000000-0000-4000-8000-000000000003', pg_temp.at(10, '17:00'));
reset role;

-- By now: Bình holds …004 and …005 (…005 due on day +10); An holds …003; Cường holds …001 (due day +10) and …002.
select is(pg_temp.due_delta('00000000-0000-4000-8000-000000000003'), 1, 'morning summary: a task An created for Bình counts for Bình');
select is(pg_temp.due_delta('00000000-0000-4000-8000-000000000002'), 0, 'morning summary: …and not for An, its creator');
select is(pg_temp.open_delta('00000000-0000-4000-8000-000000000003'), 2, 'end-of-day summary: Bình''s open work is what Bình holds now');
select is(pg_temp.open_delta('00000000-0000-4000-8000-000000000002'), 1, 'end-of-day summary: An''s is what An holds now, not what An created');

-- Bình hands it to Cường before the summaries go out.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select transfer_task('40000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000005');
reset role;

select results_eq(
  $$ select pg_temp.due_delta('00000000-0000-4000-8000-000000000003'), pg_temp.due_delta('00000000-0000-4000-8000-000000000005') $$,
  $$ values (0, 2) $$,
  'morning summary: after the transfer the task counts for Cường, no longer for Bình'
);
select results_eq(
  $$ select pg_temp.open_delta('00000000-0000-4000-8000-000000000003'), pg_temp.open_delta('00000000-0000-4000-8000-000000000005') $$,
  $$ values (1, 3) $$,
  'end-of-day summary: the same — it left Bình''s open work and joined Cường''s'
);
select is(
  (select count(*) from task_history where task_id = '40000000-0000-4000-8000-000000000005'
     and old_data ->> 'assignee_id' = '00000000-0000-4000-8000-000000000003'),
  1::bigint,
  'history still shows Bình once held the task'
);

select * from finish();
rollback;
