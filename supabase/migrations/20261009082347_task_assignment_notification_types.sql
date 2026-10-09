-- Update 4 (1/2): notification types for assignment. On their own in this migration: a new enum
-- value cannot be used in the transaction that adds it.
alter type public.notification_type add value if not exists 'TASK_ASSIGNED';
alter type public.notification_type add value if not exists 'TASK_TRANSFERRED';
