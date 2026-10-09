-- Update 4 (2/2): tell a member when a task lands on their list.
--
--   TASK_ASSIGNED     an ad-hoc task was created for them by someone else
--       Bạn có công việc mới
--       Gửi báo giá khách ABC
--       Hạn: 10/10 - 16:00
--       Người giao: An
--   TASK_TRANSFERRED  an existing ad-hoc task was handed to them
--       Bạn vừa nhận một công việc
--       Kiểm tra hợp đồng ABC
--       Chuyển từ: An
--       Hạn: 10/10 - 17:00
--
-- Rules:
--   * Only the new assignee is told — never the creator, the previous assignee or an admin.
--   * Nobody is told about their own action (creating for yourself, taking a task yourself).
--   * These are events, not schedules: they are enqueued by a trigger on tasks, through the same
--     private.enqueue_notification() as everything else (IN_APP always; ZALO when the member is
--     linked and the channel is on). Delivery, retries and failure logging are the engine's.
--   * Dedupe keys: `task-assigned:<task>` (a task is created once) and
--     `task-transferred:<task>:<n>` where n counts the task's transfers. A retried request cannot
--     double-send: transfer_task() rejects a transfer to the current assignee before anything is
--     written, and a replay of the same row hits unique (provider, dedupe_key).
--   * The member's master switch (profiles.notification_enabled) applies.
--   * A date-only deadline (23:59) is shown as the date alone; no deadline, no "Hạn" line.
-- FIXED tasks never produce these. The morning and end-of-day summaries need no change: they have
-- always counted by tasks.assignee_id, so a task follows its current assignee.

create or replace function private.member_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1))
  from public.profiles p
  where p.id = p_user_id;
$$;

-- "10/10 - 16:00", "10/10" for a date-only deadline, null when there is none.
create or replace function private.deadline_label(p_deadline timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_deadline is null then null
    when (p_deadline at time zone private.app_timezone())::time >= time '23:59' then to_char(p_deadline at time zone private.app_timezone(), 'DD/MM')
    else to_char(p_deadline at time zone private.app_timezone(), 'DD/MM - HH24:MI')
  end;
$$;

create or replace function private.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  kind public.notification_type;
  key text;
  title text;
  lines text[];
begin
  if new.type <> 'ADHOC' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is null or new.created_by = new.assignee_id then
      return new;
    end if;
    kind := 'TASK_ASSIGNED';
    key := 'task-assigned:' || new.id;
    title := 'Bạn có công việc mới';
    lines := array[
      new.title,
      'Hạn: ' || private.deadline_label(new.deadline_at),
      'Người giao: ' || private.member_name(new.created_by)
    ];
  else
    -- Taking a task yourself (e.g. a creator pulling it back) is not news to you.
    if new.assignee_id = old.assignee_id or new.assignee_id is not distinct from actor then
      return new;
    end if;
    kind := 'TASK_TRANSFERRED';
    -- This trigger runs after log_task_change (alphabetical order), so the count includes this transfer.
    key := 'task-transferred:' || new.id || ':' || (
      select count(*) from public.task_history h
      where h.task_id = new.id and h.action in ('TASK_TRANSFERRED', 'TASK_REASSIGNED_BY_ADMIN')
    );
    title := 'Bạn vừa nhận một công việc';
    lines := array[
      new.title,
      'Chuyển từ: ' || private.member_name(old.assignee_id),
      'Hạn: ' || private.deadline_label(new.deadline_at)
    ];
  end if;

  perform private.enqueue_notification(
    p.id, new.id, kind, key, now(),
    -- array_remove: a line whose value is missing (no deadline, a deleted member) is null.
    jsonb_build_object('title', title, 'body', array_to_string(array_remove(lines, null), E'\n'), 'url', '/today')
  )
  from public.profiles p
  where p.id = new.assignee_id and p.active and p.notification_enabled;

  return new;
end;
$$;

-- Internal only: called from the trigger above, never by a client role.
revoke execute on function private.member_name(uuid), private.deadline_label(timestamptz), private.notify_task_assignment() from public;

create trigger notify_task_assignment
  after insert or update of assignee_id on public.tasks
  for each row execute function private.notify_task_assignment();

create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261009082351_task_assignment_notifications',
    'server_time', now()
  );
$$;
