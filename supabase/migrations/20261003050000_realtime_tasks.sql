-- Phase 6: stream task changes to the Today screen via Supabase Realtime.
-- Realtime enforces the tasks SELECT policy per subscriber, so members only
-- receive events for rows they could read anyway.
alter publication supabase_realtime add table public.tasks;

create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261003050000_realtime_tasks',
    'server_time', now()
  );
$$;
