-- Persistent opaque identity numbers; only the server service role can access these records.
create table if not exists public.legal_document_numbers (
 kind text not null check (kind in ('student','receipt')),
 entity_id uuid not null,
 number bigint not null check (number > 0),
 primary key(kind,entity_id), unique(kind,number)
);
alter table public.legal_document_numbers enable row level security;
revoke all on public.legal_document_numbers from public, anon, authenticated;
revoke all on public.legal_document_numbers from service_role;
grant select, insert on public.legal_document_numbers to service_role;
-- A new academy starts without the source academy’s student number seed.
create table if not exists public.legal_number_counters(kind text primary key, last_number bigint not null);
alter table public.legal_number_counters enable row level security;
revoke all on public.legal_number_counters from public,anon,authenticated,service_role;
insert into public.legal_number_counters(kind,last_number)
select kind,max(number) from public.legal_document_numbers group by kind
on conflict(kind) do update set last_number=greatest(legal_number_counters.last_number,excluded.last_number);
create or replace function public.reserve_legal_document_number(p_kind text,p_entity_id uuid,p_existing bigint default null)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare n bigint;
begin
 if p_kind not in ('student','receipt') or p_entity_id is null then raise exception 'Invalid numbering request'; end if;
 -- Transaction-scoped lock: concurrent requests and retries never reuse or change identities.
 perform pg_advisory_xact_lock(hashtextextended('legal-document-' || p_kind,0));
 select number into n from public.legal_document_numbers where kind=p_kind and entity_id=p_entity_id;
 if n is not null then
  if p_existing is not null and p_existing<>n then raise exception 'Existing number conflicts with persistent identity'; end if;
  return n;
 end if;
 if p_existing is not null then
  if p_existing<1 then raise exception 'Number must be positive'; end if;
  n:=p_existing;
 else
  select coalesce((select last_number from public.legal_number_counters where kind=p_kind),0)+1 into n;
 end if;
 insert into public.legal_document_numbers values(p_kind,p_entity_id,n);
 insert into public.legal_number_counters(kind,last_number) values(p_kind,n)
 on conflict(kind) do update set last_number=greatest(legal_number_counters.last_number,excluded.last_number);
 return n;
end $$;
revoke all on function public.reserve_legal_document_number(text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.reserve_legal_document_number(text,uuid,bigint) to service_role;
