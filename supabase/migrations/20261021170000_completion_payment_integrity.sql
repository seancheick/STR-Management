begin;
alter table public.cleaner_payments add column verified boolean not null default false, add column verified_at timestamptz, add column verified_by uuid references public.users(id);
alter table public.assignments add column cleaned_on date, add column cleaned_on_source text check(cleaned_on_source in ('completion_confirmation','owner_correction'));
-- Completion evidence is the only safe historical source. Never infer actual work from checkout/due dates.
update public.assignments a set cleaned_on_source='completion_confirmation',cleaned_on=(a.completed_at at time zone coalesce(p.timezone,'America/New_York'))::date from public.properties p where p.id=a.property_id and a.completed_at is not null;
CREATE OR REPLACE FUNCTION app_private.record_cleaner_payment(payment_id uuid, target_cleaner uuid, paid_amount numeric, paid_date date, paid_method text, payment_reference text DEFAULT NULL::text, payment_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tenant uuid; existing public.cleaner_payments%rowtype;
begin
 tenant:=app_private.payment_owner();
 perform 1 from public.cleaners where id=target_cleaner and owner_id=tenant and role='cleaner' for update;
 if not found then raise exception 'Choose a cleaner on your team.'; end if;
 if payment_id is null or paid_amount is null or paid_amount<=0 or paid_amount>100000 or paid_amount<>round(paid_amount,2) or paid_date is null or paid_date>(now() at time zone 'America/New_York')::date or paid_method is null or paid_method not in ('zelle','venmo','cash','check','bank_transfer','other') or length(payment_reference)>120 or length(payment_note)>1000 then raise exception 'Enter a valid payment amount, date and method.'; end if;
 select * into existing from public.cleaner_payments where id=payment_id;
 if found then
  if existing.owner_id=tenant and existing.cleaner_id=target_cleaner and existing.amount=paid_amount and existing.payment_date=paid_date and existing.method=paid_method and existing.reference is not distinct from nullif(btrim(payment_reference),'') and existing.note is not distinct from nullif(btrim(payment_note),'') and existing.assignment_id is null and existing.voided_at is null then return; end if;
  raise exception 'This payment was already saved with different details or voided.';
 end if;
 if nullif(regexp_replace(lower(coalesce(payment_reference,'')),'[^a-z0-9]','','g'),'') is not null and exists(
 select 1 from public.cleaner_payments p where p.owner_id=tenant and p.cleaner_id=target_cleaner and p.voided_at is null and (
 regexp_replace(lower(coalesce(p.reference,'')),'[^a-z0-9]','','g')=regexp_replace(lower(payment_reference),'[^a-z0-9]','','g')
 or (length(regexp_replace(lower(payment_reference),'[^a-z0-9]','','g'))>=6 and p.amount=paid_amount and abs(p.payment_date-paid_date)<=2 and length(regexp_replace(lower(coalesce(p.reference,'')),'[^a-z0-9]','','g'))>=6 and (
 position(regexp_replace(lower(p.reference),'[^a-z0-9]','','g') in regexp_replace(lower(payment_reference),'[^a-z0-9]','','g'))>0
 or position(regexp_replace(lower(payment_reference),'[^a-z0-9]','','g') in regexp_replace(lower(p.reference),'[^a-z0-9]','','g'))>0)))) then
 raise exception 'Likely duplicate payment: this bank reference is already recorded. Check payment history before recording another payment.';
 end if;
 if exists(select 1 from public.cleaner_accounts where owner_id=tenant and cleaner_id=target_cleaner and paid_date<=reconciled_through) then raise exception 'Payment date must be after the reconciled history.'; end if;
 insert into public.cleaner_payments(id,owner_id,cleaner_id,amount,payment_date,method,reference,note,created_by)
 values(payment_id,tenant,target_cleaner,paid_amount,paid_date,paid_method,nullif(btrim(payment_reference),''),nullif(btrim(payment_note),''),auth.uid());
end $function$
;


create function public.verify_cleaner_payment(payment_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid;
begin
 tenant:=app_private.payment_owner();
 update public.cleaner_payments set verified=true,verified_at=coalesce(verified_at,now()),verified_by=coalesce(verified_by,auth.uid()) where id=payment_id and owner_id=tenant and voided_at is null;
 if not found then raise exception 'Active payment not found on your team.'; end if;
end $$;
revoke all on function public.verify_cleaner_payment(uuid) from public,anon;
grant execute on function public.verify_cleaner_payment(uuid) to authenticated;

create table public.cleaning_date_corrections (
 request_id uuid primary key, assignment_id uuid not null references public.assignments(id) on delete cascade,
 owner_id uuid not null references public.users(id), previous_date date, cleaned_on date not null, reason text not null,
 created_by uuid not null references public.users(id), created_at timestamptz not null default now()
);
alter table public.cleaning_date_corrections enable row level security;
revoke all on public.cleaning_date_corrections from public,anon,authenticated;
grant select on public.cleaning_date_corrections to authenticated;
create policy cleaning_date_corrections_read on public.cleaning_date_corrections for select to authenticated using (owner_id=(select public.current_owner_id()) and (select public.current_app_user_role()) in ('owner','admin'));

create function public.capture_cleaned_on() returns trigger language plpgsql security definer set search_path='' as $$
declare tz text;
begin
 if new.completed_at is not null and (tg_op='INSERT' or (old.completed_at is null and old.cleaned_on is null)) then
 select coalesce(timezone,'America/New_York') into tz from public.properties where id=new.property_id;
 new.cleaned_on:=(new.completed_at at time zone coalesce(tz,'America/New_York'))::date;
 new.cleaned_on_source:='completion_confirmation';
 elsif tg_op='INSERT' and (new.cleaned_on is not null or new.cleaned_on_source is not null) then
 raise exception 'Actual cleaning dates require completion evidence or an owner correction.';
 elsif tg_op='UPDATE' and (new.cleaned_on is distinct from old.cleaned_on or new.cleaned_on_source is distinct from old.cleaned_on_source) and (new.cleaned_on_source is distinct from 'owner_correction' or not exists(select 1 from public.cleaning_date_corrections c where c.assignment_id=new.id and c.cleaned_on=new.cleaned_on and c.created_by=auth.uid() and c.created_at=transaction_timestamp() and c.previous_date is not distinct from old.cleaned_on)) then
 raise exception 'Use correct_cleaning_date with a reason to change the actual cleaning date.';
 end if;
 return new;
end $$;
create trigger capture_cleaned_on before insert or update on public.assignments for each row execute function public.capture_cleaned_on();
revoke all on function public.capture_cleaned_on() from public,anon,authenticated;

create function public.correct_cleaning_date(target_assignment uuid,actual_date date,correction_reason text,request_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid; job public.assignments%rowtype; receipt public.cleaning_date_corrections%rowtype; tz text;
begin
 tenant:=app_private.payment_owner();
 select * into job from public.assignments where id=target_assignment and owner_id=tenant for update;
 if not found then raise exception 'Cleaning not found on your team.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,2));
 select * into receipt from public.cleaning_date_corrections c where c.request_id=correct_cleaning_date.request_id;
 if found then
 if receipt.assignment_id=target_assignment and receipt.cleaned_on=actual_date and receipt.reason=btrim(correction_reason) then return; end if;
 raise exception 'This request was already used with different cleaning date details.';
 end if;
 select coalesce(timezone,'America/New_York') into tz from public.properties where id=job.property_id;
 if request_id is null or actual_date is null or actual_date>(now() at time zone coalesce(tz,'America/New_York'))::date or length(btrim(coalesce(correction_reason,''))) not between 3 and 500 then raise exception 'Enter an actual cleaning date and a reason.'; end if;
 if job.status not in ('approved','completed_pending_review') then raise exception 'Complete the cleaning before correcting its actual date.'; end if;
 insert into public.cleaning_date_corrections(request_id,assignment_id,owner_id,previous_date,cleaned_on,reason,created_by) values(request_id,target_assignment,tenant,job.cleaned_on,actual_date,btrim(correction_reason),auth.uid());
 update public.assignments set cleaned_on=actual_date,cleaned_on_source='owner_correction' where id=target_assignment;
end $$;
revoke all on function public.correct_cleaning_date(uuid,date,text,uuid) from public,anon;
grant execute on function public.correct_cleaning_date(uuid,date,text,uuid) to authenticated;
commit;
