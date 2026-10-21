begin;
create table public.cleaner_account_adjustments (
 id uuid primary key, owner_id uuid not null references public.users(id),
 cleaner_id uuid not null references public.cleaners(id),
 entry_date date not null, amount numeric(12,2) not null check(amount<>0 and abs(amount)<=100000),
 kind text not null check(kind in ('charge_correction','payment_correction')),
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 created_at timestamptz not null default now(), created_by uuid not null references public.users(id)
);
comment on column public.cleaner_account_adjustments.amount is 'Signed balance delta. Charge correction: positive adds charge, negative reduces charge. Payment correction: negative adds payment, positive reverses payment.';
create index cleaner_account_adjustments_statement on public.cleaner_account_adjustments(owner_id,cleaner_id,entry_date);
alter table public.cleaner_account_adjustments enable row level security;
revoke all on public.cleaner_account_adjustments from public,anon,authenticated;
grant select on public.cleaner_account_adjustments to authenticated;
grant all on public.cleaner_account_adjustments to service_role;
create policy account_adjustments_read on public.cleaner_account_adjustments for select to authenticated using(owner_id=public.current_owner_id() and (public.current_app_user_role() in ('owner','admin','supervisor') or cleaner_id=app_private.current_cleaner_id()));
create function app_private.post_cleaner_account_adjustment(request_id uuid,target_cleaner uuid,adjustment_date date,signed_amount numeric,adjustment_kind text,adjustment_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid; existing public.cleaner_account_adjustments%rowtype;
begin
 tenant:=app_private.payment_owner();
 perform 1 from public.cleaners where id=target_cleaner and owner_id=tenant for update;
 if not found then raise exception 'Choose a cleaner on your team.'; end if;
 if request_id is null or adjustment_date is null or adjustment_date>(now() at time zone 'America/New_York')::date or signed_amount is null or signed_amount=0 or abs(signed_amount)>100000 or signed_amount<>round(signed_amount,2) or adjustment_kind is null or adjustment_kind not in ('charge_correction','payment_correction') or adjustment_reason is null or length(btrim(adjustment_reason)) not between 3 and 1000 then raise exception 'Enter a valid adjustment date, signed amount, kind and reason.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,2));
 select * into existing from public.cleaner_account_adjustments where id=request_id;
 if found then
  if existing.owner_id=tenant and existing.cleaner_id=target_cleaner and existing.entry_date=adjustment_date and existing.amount=signed_amount and existing.kind=adjustment_kind and existing.reason=btrim(adjustment_reason) then return; end if;
  raise exception 'This adjustment request was already saved with different details.';
 end if;
 insert into public.cleaner_account_adjustments(id,owner_id,cleaner_id,entry_date,amount,kind,reason,created_by) values(request_id,tenant,target_cleaner,adjustment_date,signed_amount,adjustment_kind,btrim(adjustment_reason),auth.uid());
end $$;
create function public.post_cleaner_account_adjustment(request_id uuid,target_cleaner uuid,adjustment_date date,signed_amount numeric,adjustment_kind text,adjustment_reason text)
returns void language sql security invoker set search_path='' as $$ select app_private.post_cleaner_account_adjustment(request_id,target_cleaner,adjustment_date,signed_amount,adjustment_kind,adjustment_reason); $$;
revoke all on function app_private.post_cleaner_account_adjustment(uuid,uuid,date,numeric,text,text),public.post_cleaner_account_adjustment(uuid,uuid,date,numeric,text,text) from public,anon;
grant execute on function app_private.post_cleaner_account_adjustment(uuid,uuid,date,numeric,text,text),public.post_cleaner_account_adjustment(uuid,uuid,date,numeric,text,text) to authenticated;
commit;
