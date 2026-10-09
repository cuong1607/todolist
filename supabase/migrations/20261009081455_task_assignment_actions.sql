-- Update 3 (1/2): history actions for assignment. On their own in this migration: a new enum
-- value cannot be used in the transaction that adds it.
alter type public.task_action add value if not exists 'TASK_ASSIGNED';
alter type public.task_action add value if not exists 'TASK_TRANSFERRED';
alter type public.task_action add value if not exists 'TASK_REASSIGNED_BY_ADMIN';
