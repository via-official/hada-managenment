-- v2.8.0: 새 학원 최초 설치 때 한 번 쓰는 "예시 데이터 비우기"(관리자 설정 화면 → clear-example-data 함수).
--
-- hada_setup_flags(key = 'example_clear')에 진행 상태를 두고, 끝나면 state = 'done'으로 잠근다.
-- 이 마이그레이션이 처음 들어갈 때 사본 표에 데이터가 있으면 이미 쓰고 있는 학원(원본 포함)으로 보고 'locked'로 잠근다.
-- 갓 만든 Supabase(복제 직후 새 학원)는 표가 비어 있어 잠기지 않는다. 다시 열 때는 그 행을 지운다.
-- 접근: RLS를 켜고 정책을 두지 않아 함수(서비스 역할)만 읽고 쓴다.

create table if not exists public.hada_setup_flags (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.hada_setup_flags enable row level security;

do $$
declare t text; used boolean := false; found_row boolean;
begin
  foreach t in array array['attendance_records', 'report_cache', 'cr_sessions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select exists (select 1 from public.%I)', t) into found_row;
      used := used or found_row;
    end if;
  end loop;
  if used then
    insert into public.hada_setup_flags (key, value)
    values ('example_clear', jsonb_build_object('state', 'locked', 'reason', '이미 쓰고 있는 학원', 'at', now()))
    on conflict (key) do nothing;
  end if;
end $$;

-- Supabase에 남은 예시 사본을 비운다(scripts/clear-example-data.sql과 같은 표). 관리자 비밀번호·보안 설정과
-- hada_setup_flags는 남긴다. 없는 표는 건너뛴다. "where true"는 WHERE 없는 DELETE를 막는 설정을 피하려는 것.
create or replace function public.hada_clear_example_copies() returns void
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  foreach t in array array[
    'cr_activities', 'cr_records', 'cr_attendance', 'cr_sessions',
    'report_cache', 'report_source_cache', 'report_source_sync_state',
    'attendance_records', 'sync_cursors', 'lib_units', 'lib_books',
    'kiosk_today', 'kiosk_prepared',
    'sync_queue', 'dashboard_date_locks',
    'legal_document_numbers', 'legal_number_counters',
    'neis_school_jobs', 'neis_manual_runs'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where true', t);
    end if;
  end loop;
end $$;
revoke all on function public.hada_clear_example_copies() from public, anon, authenticated;
grant execute on function public.hada_clear_example_copies() to service_role;
