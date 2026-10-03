-- Local development seed data. Runs after migrations on `npm run db:reset`.
-- Never put production data or real credentials here.
--
-- Accounts (password for all: Password123!)
--   admin@team.local   ADMIN
--   an@team.local      EMPLOYEE
--   binh@team.local    EMPLOYEE

with seed_users (id, email, full_name) as (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@team.local', 'Quản Trị'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'an@team.local', 'Nguyễn Văn An'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'binh@team.local', 'Trần Thị Bình')
),
inserted as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
    extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', full_name), now(), now(),
    '', '', '', ''
  from seed_users
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from inserted;

-- Profiles were created by the on_auth_user_created trigger as EMPLOYEE; promote the admin.
update public.profiles set role = 'ADMIN' where id = '00000000-0000-4000-8000-000000000001';

-- Fixed task templates (every day so local testing works on any weekday)
insert into public.fixed_task_templates (assignee_id, title, note, allow_employee_note, due_time, weekdays, sort_order, created_by)
values
  ('00000000-0000-4000-8000-000000000002', 'Kiểm tra đơn hàng mới', 'Xác nhận đơn trên hệ thống trước 9h.', false, '09:00', '{1,2,3,4,5,6,7}', 1, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002', 'Đóng gói & bàn giao vận chuyển', null, false, '15:00', '{1,2,3,4,5,6,7}', 2, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002', 'Báo cáo tồn kho cuối ngày', 'Ghi số lượng tồn của 5 mã bán chạy.', true, '17:30', '{1,2,3,4,5,6,7}', 3, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000003', 'Trả lời tin nhắn khách hàng', 'Fanpage + Zalo OA.', true, '10:00', '{1,2,3,4,5,6,7}', 1, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000003', 'Đăng bài sản phẩm mới', null, false, null, '{1,3,5}', 2, '00000000-0000-4000-8000-000000000001');

-- Generate today's tasks (the cron job does this daily at 00:05 Asia/Bangkok).
select private.generate_fixed_tasks();

