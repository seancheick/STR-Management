begin;
alter table public.assignments add column cleaning_scope_property_id uuid, add column cleaning_scope_total numeric(10,2) check(cleaning_scope_total>0);
alter table public.assignments add constraint assignments_cleaning_scope_property_fk foreign key(owner_id,cleaning_scope_property_id) references public.properties(owner_id,id);
create table public.cleaning_scope_corrections (
 id uuid primary key, assignment_id uuid not null references public.assignments(id), owner_id uuid not null references public.users(id), actor_id uuid not null references public.users(id), reason text not null, before_record jsonb not null, after_record jsonb not null, created_at timestamptz not null default now()
);
create table public.cleaning_pay_adjustments (
 id uuid primary key default gen_random_uuid(), correction_id uuid not null unique references public.cleaning_scope_corrections(id), owner_id uuid not null references public.users(id), assignment_id uuid not null references public.assignments(id), cleaner_id uuid not null references public.cleaners(id), amount numeric(10,2) not null check(amount<>0), entry_date date not null, reason text not null, created_at timestamptz not null default now()
);
alter table public.cleaning_scope_corrections enable row level security;
alter table public.cleaning_pay_adjustments enable row level security;
revoke all on public.cleaning_scope_corrections,public.cleaning_pay_adjustments from anon,authenticated;
grant select on public.cleaning_scope_corrections,public.cleaning_pay_adjustments to authenticated;
grant all on public.cleaning_scope_corrections,public.cleaning_pay_adjustments to service_role;
create policy scope_read on public.cleaning_scope_corrections for select to authenticated using(owner_id=public.current_owner_id() and (public.current_app_user_role() in ('owner','admin','supervisor') or exists(select 1 from public.assignments a where a.id=assignment_id and a.cleaner_id=app_private.current_cleaner_id())));
create policy adjustment_read on public.cleaning_pay_adjustments for select to authenticated using(owner_id=public.current_owner_id() and (public.current_app_user_role() in ('owner','admin','supervisor') or cleaner_id=app_private.current_cleaner_id()));
-- A private transaction marker is not trusted: verify the matching pending receipt,
-- created by the guarded RPC, before allowing its update.
create function app_private.scope_correction_active(job uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.cleaning_scope_corrections c where c.id=nullif(current_setting('app.scope_correction',true),'')::uuid and c.assignment_id=job and c.actor_id=auth.uid() and c.after_record='{}'::jsonb and c.created_at=transaction_timestamp());
$$;
revoke all on function app_private.scope_correction_active(uuid) from public,anon,authenticated;
create function app_private.guard_cleaning_scope() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if app_private.scope_correction_active(new.id) then return new; end if;
 if (tg_op='INSERT' and (new.cleaning_scope_property_id is not null or new.cleaning_scope_total is not null)) or (tg_op='UPDATE' and (new.cleaning_scope_property_id is distinct from old.cleaning_scope_property_id or new.cleaning_scope_total is distinct from old.cleaning_scope_total or (old.cleaning_scope_total is not null and (new.fixed_payout_amount is distinct from old.fixed_payout_amount or new.listing_property_id is distinct from old.listing_property_id)))) then raise exception 'Use the cleaning scope correction action to change corrected scope or pay.'; end if;
 return new;
end $$;
revoke all on function app_private.guard_cleaning_scope() from public,anon,authenticated;
create trigger guard_cleaning_scope before insert or update on public.assignments for each row execute function app_private.guard_cleaning_scope();
create or replace function public.guard_assignment_pay() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.fixed_payout_amount is distinct from old.fixed_payout_amount then
  if auth.uid() is not null and not exists(select 1 from public.users where id=auth.uid() and active and role in ('owner','admin') and owner_id=old.owner_id) then raise exception 'Only the host can change job pay.'; end if;
  if auth.uid() is not null and not app_private.scope_correction_active(old.id) then perform public.assert_job_pay_editable(old.id); end if;
  if new.fixed_payout_amount is null and exists(select 1 from public.assignment_extras where assignment_id=old.id) then raise exception 'Total pay is required while extras exist.'; end if;
  if new.fixed_payout_amount<coalesce((select sum(amount) from public.assignment_extras where assignment_id=old.id),0) then raise exception 'Total pay cannot be less than its itemized extras.'; end if;
 end if;
 return new;
end $$;
create function app_private.correct_cleaning_scope(request_id uuid,target_assignment uuid,target_scope uuid,corrected_total numeric,correction_reason text,expected_current_total numeric default null,expected_current_scope uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid; job public.assignments%rowtype; scope public.properties%rowtype; receipt public.cleaning_scope_corrections%rowtype; locked boolean; delta numeric;
begin
 tenant:=app_private.payment_owner();
 if request_id is null or corrected_total is null or corrected_total<=0 or corrected_total>100000 or corrected_total<>round(corrected_total,2) or correction_reason is null or length(btrim(correction_reason)) not between 3 and 1000 then raise exception 'Provide a request ID, valid positive total and correction reason.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select * into receipt from public.cleaning_scope_corrections where id=request_id;
 if found then
  if receipt.owner_id=tenant and receipt.assignment_id=target_assignment and receipt.after_record->>'cleaning_scope_property_id'=target_scope::text and (receipt.after_record->>'cleaning_scope_total')::numeric=corrected_total and receipt.reason=btrim(correction_reason) then return to_jsonb(receipt)||jsonb_build_object('old_total',coalesce((receipt.before_record->>'cleaning_scope_total')::numeric,(receipt.before_record->>'fixed_payout_amount')::numeric,0),'new_total',corrected_total,'delta',corrected_total-coalesce((receipt.before_record->>'cleaning_scope_total')::numeric,(receipt.before_record->>'fixed_payout_amount')::numeric,0),'financial_history_locked',(receipt.after_record->>'_financial_history_locked')::boolean,'scope_property_id',target_scope); end if;
  raise exception 'Correction request ID was already used with different details.';
 end if;
 select * into job from public.assignments where id=target_assignment and owner_id=tenant for update;
 if not found then raise exception 'Cleaning not found.'; end if;
 if job.status='cancelled' or job.assignment_type<>'cleaning' then raise exception 'Only active cleaning jobs can have scope corrected.'; end if;
 select * into scope from public.properties where id=target_scope and owner_id=tenant;
 if not found or not scope.active or coalesce(scope.physical_unit_id,scope.id)<>job.property_id then raise exception 'Choose a configuration of the same physical unit.'; end if;
 if expected_current_scope is not null and expected_current_scope<>coalesce(job.cleaning_scope_property_id,job.listing_property_id,job.property_id) then raise exception 'Cleaning scope changed. Refresh the correction preview.'; end if;
 if expected_current_total is not null and expected_current_total<>coalesce(job.cleaning_scope_total,job.fixed_payout_amount,0) then raise exception 'Cleaning total changed. Refresh the correction preview.'; end if;
 locked:=job.paid_at is not null or job.ledger_entry_id is not null or exists(select 1 from public.payout_entries where assignment_id=job.id) or exists(select 1 from public.cleaning_pay_adjustments where assignment_id=job.id);
 if corrected_total<coalesce((select sum(amount) from public.assignment_extras where assignment_id=job.id),0) then raise exception 'Total pay cannot be less than its itemized extras.'; end if;
 delta:=corrected_total-coalesce(job.cleaning_scope_total,job.fixed_payout_amount,0);
 if locked and delta<>0 and job.cleaner_id is null then raise exception 'A financial adjustment requires the assigned cleaner.'; end if;
 insert into public.cleaning_scope_corrections(id,assignment_id,owner_id,actor_id,reason,before_record,after_record) values(request_id,job.id,tenant,auth.uid(),btrim(correction_reason),to_jsonb(job),'{}');
 perform set_config('app.scope_correction',request_id::text,true);
 update public.assignments set cleaning_scope_property_id=scope.id,cleaning_scope_total=corrected_total,fixed_payout_amount=case when locked then fixed_payout_amount else corrected_total end where id=job.id;
 -- Refresh only an untouched open checklist; never discard completion/photo evidence.
 if job.status in ('unassigned','assigned','confirmed') and job.started_at is null and scope.primary_checklist_template_id is not null
 and not exists(select 1 from public.assignment_checklist_items where assignment_id=job.id and (completed or completed_at is not null or completed_by_id is not null))
 and not exists(select 1 from public.assignment_photos where assignment_id=job.id) then
  delete from public.assignment_checklist_items where assignment_id=job.id;
  insert into public.assignment_checklist_items(assignment_id,template_item_id,section_name,label,required,photo_category,sort_order)
   select job.id,id,section_name,label,required,photo_category,sort_order from public.checklist_template_items where template_id=scope.primary_checklist_template_id;
 end if;
 insert into public.assignment_notes(assignment_id,user_id,note_type,body) values(job.id,auth.uid(),'admin_pay','Cleaning scope corrected to '||scope.name||'; total $'||corrected_total||'. '||btrim(correction_reason)||' Existing completion evidence preserved.');
 update public.cleaning_scope_corrections set after_record=(select to_jsonb(a)||jsonb_build_object('_financial_history_locked',locked) from public.assignments a where a.id=job.id) where id=request_id returning * into receipt;
 if locked and delta<>0 then insert into public.cleaning_pay_adjustments(correction_id,owner_id,assignment_id,cleaner_id,amount,entry_date,reason) values(request_id,tenant,job.id,job.cleaner_id,delta,(now() at time zone 'America/New_York')::date,btrim(correction_reason)); end if;
 perform set_config('app.scope_correction','',true);
 return to_jsonb(receipt)||jsonb_build_object('old_total',coalesce((receipt.before_record->>'cleaning_scope_total')::numeric,(receipt.before_record->>'fixed_payout_amount')::numeric,0),'new_total',corrected_total,'delta',corrected_total-coalesce((receipt.before_record->>'cleaning_scope_total')::numeric,(receipt.before_record->>'fixed_payout_amount')::numeric,0),'financial_history_locked',(receipt.after_record->>'_financial_history_locked')::boolean,'scope_property_id',target_scope);
end $$;
create function public.correct_cleaning_scope(request_id uuid,target_assignment uuid,target_scope uuid,corrected_total numeric,correction_reason text,expected_current_total numeric default null,expected_current_scope uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select app_private.correct_cleaning_scope(request_id,target_assignment,target_scope,corrected_total,correction_reason,expected_current_total,expected_current_scope); $$;
revoke all on function public.correct_cleaning_scope(uuid,uuid,uuid,numeric,text,numeric,uuid),app_private.correct_cleaning_scope(uuid,uuid,uuid,numeric,text,numeric,uuid) from public,anon;
grant execute on function public.correct_cleaning_scope(uuid,uuid,uuid,numeric,text,numeric,uuid),app_private.correct_cleaning_scope(uuid,uuid,uuid,numeric,text,numeric,uuid) to authenticated,service_role;
commit;
