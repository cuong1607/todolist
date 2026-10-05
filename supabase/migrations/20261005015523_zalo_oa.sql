-- Phase 10: Zalo Official Account as a second notification provider.
--
-- What lives where:
--   * App id / app secret / OA secret key   → server environment only (never in the database, never in the browser)
--   * OA access + refresh tokens (rotating) → Supabase Vault (encrypted), reachable only through the
--                                             service-role RPCs below
--   * Who is linked                          → profiles.zalo_user_id / zalo_connected
--   * Is the channel on                      → system_settings.zalo_enabled (+ zalo_oa_id / zalo_oa_name for display)
--
-- The engine from Phase 9 is unchanged: a member who is linked gets an extra ZALO row, and the app's
-- worker (POST /api/cron/zalo-dispatch) drains it with claim / complete / fail.

create extension if not exists pg_net with schema extensions;

-- Test messages sent from the admin screen are logged like any other notification.
alter type public.notification_type add value if not exists 'TEST';

insert into public.system_settings (key, value, description) values
  ('zalo_enabled', 'false', 'Bật gửi thông báo qua Zalo OA')
on conflict (key) do nothing;

create or replace function private.zalo_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.value = 'true'::jsonb from public.system_settings s where s.key = 'zalo_enabled'), false);
$$;

-- ============================================================
-- Vault helpers (private; callers are the definer functions below)
-- ============================================================
create or replace function private.set_secret(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  select id into existing from vault.secrets where name = p_name;
  if existing is null then
    perform vault.create_secret(p_value, p_name);
  else
    perform vault.update_secret(existing, p_value);
  end if;
end;
$$;

create or replace function private.get_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = p_name $$;

-- ============================================================
-- OA tokens — service role only
-- ============================================================
create or replace function public.zalo_get_tokens()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.get_secret('zalo_oa_tokens')::jsonb $$;

create or replace function public.zalo_save_tokens(p_access_token text, p_refresh_token text, p_expires_at timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.set_secret('zalo_oa_tokens', jsonb_build_object(
    'access_token', p_access_token,
    'refresh_token', p_refresh_token,
    'expires_at', p_expires_at
  )::text);
$$;

create or replace function public.zalo_clear_tokens()
returns void
language sql
security definer
set search_path = ''
as $$ delete from vault.secrets where name = 'zalo_oa_tokens' $$;

-- Where pg_cron should poke the app's worker, and the shared secret it must present.
create or replace function public.zalo_configure_dispatch(p_url text, p_secret text)
returns void
language sql
security definer
set search_path = ''
as $$ select private.set_secret('zalo_dispatch', jsonb_build_object('url', p_url, 'secret', p_secret)::text) $$;

revoke execute on function public.zalo_get_tokens() from public, anon, authenticated;
revoke execute on function public.zalo_save_tokens(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.zalo_clear_tokens() from public, anon, authenticated;
revoke execute on function public.zalo_configure_dispatch(text, text) from public, anon, authenticated;
grant execute on function public.zalo_get_tokens() to service_role;
grant execute on function public.zalo_save_tokens(text, text, timestamptz) to service_role;
grant execute on function public.zalo_clear_tokens() to service_role;
grant execute on function public.zalo_configure_dispatch(text, text) to service_role;

-- What the admin screen may know: facts, never the tokens themselves.
create or replace function public.zalo_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tokens jsonb;
begin
  if not private.is_admin() then
    raise exception 'Chỉ admin được xem trạng thái Zalo' using errcode = '42501';
  end if;
  tokens := private.get_secret('zalo_oa_tokens')::jsonb;
  return jsonb_build_object(
    'connected', tokens is not null,
    'access_token_expires_at', tokens ->> 'expires_at',
    'dispatch_configured', private.get_secret('zalo_dispatch') is not null
  );
end;
$$;

revoke execute on function public.zalo_status() from public, anon;
grant execute on function public.zalo_status() to authenticated;

-- ============================================================
-- Linking a member to their Zalo account
--   1. member asks for a code (zalo_create_link_code)
--   2. member sends the code to the OA in Zalo
--   3. the webhook calls zalo_link_by_code(code, sender id)
-- ============================================================
create table private.zalo_link_codes (
  code text primary key,
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  expires_at timestamptz not null
);

-- 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L): ~10^12 codes, valid 15 minutes.
create or replace function public.zalo_create_link_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  new_code text;
begin
  if uid is null or not private.is_active_user() then
    raise exception 'Cần đăng nhập' using errcode = '42501';
  end if;

  select string_agg(substr(alphabet, 1 + get_byte(b.bytes, i) % length(alphabet), 1), '')
  into new_code
  from (select extensions.gen_random_bytes(8) as bytes) b, generate_series(0, 7) i;

  delete from private.zalo_link_codes where expires_at < now();
  insert into private.zalo_link_codes (code, user_id, expires_at)
  values (new_code, uid, now() + interval '15 minutes')
  on conflict (user_id) do update set code = excluded.code, expires_at = excluded.expires_at;

  return new_code;
end;
$$;

revoke execute on function public.zalo_create_link_code() from public, anon;
grant execute on function public.zalo_create_link_code() to authenticated;

-- Called by the webhook (service role). Returns {status: linked | invalid | taken, full_name?}.
create or replace function public.zalo_link_by_code(p_code text, p_zalo_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  member_name text;
begin
  select user_id into target
  from private.zalo_link_codes
  where code = upper(trim(p_code)) and expires_at > now();
  if target is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- One Zalo account ↔ one member.
  if exists (select 1 from public.profiles where zalo_user_id = p_zalo_user_id and id <> target) then
    return jsonb_build_object('status', 'taken');
  end if;

  update public.profiles
  set zalo_user_id = p_zalo_user_id, zalo_connected = true
  where id = target
  returning full_name into member_name;

  delete from private.zalo_link_codes where user_id = target;
  return jsonb_build_object('status', 'linked', 'full_name', member_name);
end;
$$;

revoke execute on function public.zalo_link_by_code(text, text) from public, anon, authenticated;
grant execute on function public.zalo_link_by_code(text, text) to service_role;

-- Members unlink themselves; admins may unlink anyone. (The profile guard trigger blocks direct writes.)
create or replace function public.zalo_unlink(p_user_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target uuid := coalesce(p_user_id, (select auth.uid()));
begin
  if uid is null then
    raise exception 'Cần đăng nhập' using errcode = '42501';
  end if;
  if target <> uid and not private.is_admin() then
    raise exception 'Chỉ admin được gỡ liên kết của người khác' using errcode = '42501';
  end if;

  update public.profiles set zalo_user_id = null, zalo_connected = false where id = target;
  delete from private.zalo_link_codes where user_id = target;
  return found;
end;
$$;

revoke execute on function public.zalo_unlink(uuid) from public, anon;
grant execute on function public.zalo_unlink(uuid) to authenticated;

-- ============================================================
-- Engine: only queue ZALO rows when the channel is switched on
-- ============================================================
create or replace function private.enqueue_notification(
  p_user_id uuid,
  p_task_id uuid,
  p_type public.notification_type,
  p_dedupe_key text,
  p_scheduled_at timestamptz,
  p_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.notification_logs (user_id, task_id, type, provider, payload, scheduled_at, dedupe_key)
  select p_user_id, p_task_id, p_type, pr.provider, p_payload, p_scheduled_at, p_dedupe_key
  from public.profiles p
  cross join lateral (
    select 'IN_APP'::public.notification_provider
    union all
    select 'ZALO'::public.notification_provider
    where p.zalo_connected and p.zalo_user_id is not null and private.zalo_enabled()
  ) pr(provider)
  where p.id = p_user_id
  on conflict (provider, dedupe_key) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Some failures will never succeed on retry (member blocked the OA, not linked…): p_final skips the retries.
drop function public.fail_notification(bigint, text);
create or replace function public.fail_notification(p_id bigint, p_error text, p_final boolean default false)
returns public.notification_status
language sql
security definer
set search_path = ''
as $$
  update public.notification_logs
  set
    retry_count = retry_count + 1,
    error = left(p_error, 1000),
    claimed_at = null,
    status = case when p_final or retry_count + 1 >= 3 then 'FAILED' else 'PENDING' end::public.notification_status,
    failed_at = case when p_final or retry_count + 1 >= 3 then now() end,
    scheduled_at = case
      when p_final or retry_count + 1 >= 3 then scheduled_at
      else now() + case retry_count when 0 then interval '1 minute' else interval '5 minutes' end
    end
  where id = p_id and status = 'PROCESSING'
  returning status;
$$;

revoke execute on function public.fail_notification(bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.fail_notification(bigint, text, boolean) to service_role;

-- ============================================================
-- Wake the app's worker when there is Zalo mail to send
-- ============================================================
create or replace function private.trigger_zalo_dispatch()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target jsonb;
begin
  if not exists (
    select 1 from public.notification_logs
    where provider = 'ZALO' and status = 'PENDING' and scheduled_at <= now()
  ) then
    return false;
  end if;

  target := private.get_secret('zalo_dispatch')::jsonb;
  if target is null then
    return false;
  end if;

  perform net.http_post(
    url := target ->> 'url',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (target ->> 'secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  return true;
end;
$$;

create or replace function private.notification_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.release_stuck_notifications();
  perform private.schedule_notifications();
  perform private.deliver_in_app();
  perform private.trigger_zalo_dispatch();
end;
$$;

create or replace function public.app_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', '20261005015523_zalo_oa',
    'server_time', now()
  );
$$;
