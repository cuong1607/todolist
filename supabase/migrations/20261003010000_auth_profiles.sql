-- Phase 2: roles, profiles, RLS.

-- ============================================================
-- Role enum
-- ============================================================
create type public.app_role as enum ('ADMIN', 'EMPLOYEE');

-- ============================================================
-- Profiles (1:1 with auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 100),
  avatar_url text,
  role public.app_role not null default 'EMPLOYEE',
  active boolean not null default true,
  zalo_user_id text unique,
  zalo_connected boolean not null default false,
  notification_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'App-level user data. Row is created by trigger on auth.users insert.';
comment on column public.profiles.email is 'Mirrored from auth.users.email for display; not editable by clients.';

create index profiles_role_active_idx on public.profiles (role, active);

create trigger set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ============================================================
-- Helpers (private schema: callable from policies, not via the Data API)
-- ============================================================
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public;

-- SECURITY DEFINER so it can read profiles without recursing into profiles' own RLS.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'ADMIN'
      and active
  );
$$;

-- True when the current user has an active profile. Use in policies on business tables.
create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and active
  );
$$;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_active_user() to authenticated;

-- ============================================================
-- Create profile on signup. Role is ALWAYS 'EMPLOYEE' here — never read
-- it from user metadata, which the client controls.
-- ============================================================
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)), 100)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- ============================================================
-- Column-level guard for client updates.
-- RLS decides WHICH rows a user may update; this decides WHICH COLUMNS.
-- Only applies to the `authenticated` role — server-side jobs (service_role,
-- e.g. the future Zalo integration) are trusted.
-- ============================================================
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.id <> old.id
    or new.email is distinct from old.email
    or new.created_at <> old.created_at
    or new.zalo_user_id is distinct from old.zalo_user_id
    or new.zalo_connected <> old.zalo_connected
  then
    raise exception 'Không được phép sửa trường này' using errcode = '42501';
  end if;

  if new.role <> old.role or new.active <> old.active then
    if not private.is_admin() then
      raise exception 'Chỉ admin được đổi quyền hoặc trạng thái' using errcode = '42501';
    end if;
    if old.id = (select auth.uid()) then
      raise exception 'Không thể tự đổi quyền hoặc khoá chính mình' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

grant execute on function private.guard_profile_update() to authenticated;

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;

revoke all on public.profiles from anon;
revoke insert, delete, truncate on public.profiles from authenticated;

create policy "profiles: read own or admin reads all"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy "profiles: update own or admin updates all"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- No insert/delete policies: profiles are created by trigger and members are
-- deactivated (active = false), never deleted from the client.

-- ============================================================
-- Health check now reports the latest schema version
-- ============================================================
create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261003010000_auth_profiles',
    'server_time', now()
  );
$$;
