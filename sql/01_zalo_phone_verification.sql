-- ============================================================
-- ABRAHAM BIKE - ZALO PHONE VERIFICATION
-- Chạy 1 lần trong Supabase > SQL Editor.
-- Bảng này KHÔNG mở cho anon/authenticated; chỉ API Vercel dùng
-- SUPABASE_SERVICE_ROLE_KEY mới truy cập được.
-- ============================================================

create table if not exists public.abraham_phone_verifications (
  id              uuid primary key,
  expected_phone  text        not null,
  verified_phone  text,
  status          text        not null default 'pending'
                  check (status in ('pending', 'verified', 'expired', 'cancelled')),
  form_data       jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  verified_at     timestamptz,
  used_at         timestamptz
);

create index if not exists idx_abraham_phone_verifications_phone
  on public.abraham_phone_verifications (expected_phone, created_at desc);

create index if not exists idx_abraham_phone_verifications_expires
  on public.abraham_phone_verifications (expires_at);

alter table public.abraham_phone_verifications enable row level security;

revoke all on table public.abraham_phone_verifications from anon;
revoke all on table public.abraham_phone_verifications from authenticated;

-- ------------------------------------------------------------
-- BẮT BUỘC: khóa đường gọi trực tiếp abraham_submit_lead từ
-- trình duyệt. Nếu không, người dùng có thể bỏ qua bước Zalo
-- và tự gọi RPC bằng anon key trong DevTools.
--
-- Đoạn DO bên dưới tự tìm mọi overload của function để không
-- phụ thuộc chữ ký tham số hiện tại.
-- ------------------------------------------------------------
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'abraham_submit_lead'
  loop
    execute format('revoke execute on function %s from anon', fn);
    execute format('revoke execute on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$$;

