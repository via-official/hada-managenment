-- 비아 서울 이전: 함수 배포 전에 예시 비우기 완료 상태를 보존한다.
-- 기존 기록은 덮어쓰지 않고, 완료가 아닌 상태라면 배포를 중단한다.
insert into public.hada_setup_flags (key, value)
values (
  'example_clear',
  jsonb_build_object('state', 'done', 'reason', '도쿄에서 완료, 서울 이전', 'at', now())
)
on conflict (key) do nothing;

do $$
begin
  if not exists (
    select 1 from public.hada_setup_flags
    where key = 'example_clear' and value->>'state' = 'done'
  ) then
    raise exception '예시 비우기 상태가 완료가 아닙니다. 기존 기록을 확인하세요.';
  end if;
end $$;