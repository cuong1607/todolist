-- Phase 10 Zalo OA: linking members, token storage, who may call what. Run: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

-- ---------- link codes ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
create temp table codes (label text primary key, code text);
grant all on codes to authenticated;
insert into codes values ('first', zalo_create_link_code());
select matches((select code from codes where label = 'first'), '^[A-HJ-KM-NP-Z2-9]{8}$', 'link code: 8 characters, no look-alikes');
insert into codes values ('second', zalo_create_link_code());
select isnt((select code from codes where label = 'second'), (select code from codes where label = 'first'), 'asking again replaces the code');

select throws_ok($$ select zalo_link_by_code('ANYTHING', 'zalo-x') $$, '42501', null, 'members cannot link accounts themselves (webhook only)');
select throws_ok($$ select zalo_get_tokens() $$, '42501', null, 'members cannot read OA tokens');
select throws_ok($$ select zalo_status() $$, '42501', null, 'only admins see the connection status');
select throws_ok(
  $$ update profiles set zalo_user_id = 'forged', zalo_connected = true where id = '00000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'members cannot write their Zalo id directly'
);
reset role;

-- ---------- webhook side (service role in production; postgres here) ----------
select is(
  zalo_link_by_code((select code from codes where label = 'first'), 'zalo-an') ->> 'status',
  'invalid',
  'a replaced code no longer works'
);
select is(
  zalo_link_by_code('  ' || lower((select code from codes where label = 'second')) || ' ', 'zalo-an') ->> 'status',
  'linked',
  'the current code links the sender (case and spaces forgiven)'
);
select results_eq(
  $$ select zalo_user_id, zalo_connected from profiles where id = '00000000-0000-4000-8000-000000000002' $$,
  $$ values ('zalo-an', true) $$,
  'the profile now carries the Zalo user id'
);
select is(
  zalo_link_by_code((select code from codes where label = 'second'), 'zalo-an') ->> 'status',
  'invalid',
  'a code works once'
);

-- One Zalo account cannot be attached to two members.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into codes values ('binh', zalo_create_link_code());
reset role;
select is(zalo_link_by_code((select code from codes where label = 'binh'), 'zalo-an') ->> 'status', 'taken', 'a Zalo account already linked to someone else is refused');

-- Expired codes are dead.
update private.zalo_link_codes set expires_at = now() - interval '1 second';
select is(zalo_link_by_code((select code from codes where label = 'binh'), 'zalo-binh') ->> 'status', 'invalid', 'codes expire');

-- ---------- unlink ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$ select zalo_unlink('00000000-0000-4000-8000-000000000002') $$, '42501', null, 'a member cannot unlink someone else');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$ select zalo_unlink() $$, 'a member unlinks themselves');
reset role;
select results_eq(
  $$ select zalo_user_id, zalo_connected from profiles where id = '00000000-0000-4000-8000-000000000002' $$,
  $$ values (null::text, false) $$,
  'unlinking clears the Zalo id'
);

-- ---------- tokens live in Vault, status exposes facts only ----------
select zalo_save_tokens('access-1', 'refresh-1', now() + interval '1 hour');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select (s ->> 'connected')::boolean and not (s::text like '%access-1%') and not (s::text like '%refresh-1%') from zalo_status() s),
  true,
  'admin status says connected without leaking the tokens'
);
reset role;

select * from finish();
rollback;
