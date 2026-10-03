-- Phase 1 foundation: shared helpers only, no business tables yet.

-- Internal helpers live in `private`, which is NOT exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Generic trigger to keep `updated_at` current. Attach to tables with:
--   create trigger set_updated_at before update on public.<table>
--     for each row execute function private.set_updated_at();
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Lightweight connectivity check used by the app's /api/health route.
-- Returns the latest applied schema version so we can confirm migrations ran.
create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261003000000_foundation',
    'server_time', now()
  );
$$;

revoke all on function public.app_health() from public;
grant execute on function public.app_health() to anon, authenticated;
