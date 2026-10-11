-- Operational deduplication uses property_id; listing_property_id preserves the
-- booked bedroom configuration, payout and checklist expectations for display.
alter table public.assignments add column listing_property_id uuid;
alter table public.reservations add column listing_property_id uuid;
alter table public.assignments add constraint assignments_listing_property_fk foreign key (owner_id,listing_property_id) references public.properties(owner_id,id);
alter table public.reservations add constraint reservations_listing_property_fk foreign key (owner_id,listing_property_id) references public.properties(owner_id,id);
create index assignments_listing_property_idx on public.assignments(owner_id,listing_property_id);
create index reservations_listing_property_idx on public.reservations(owner_id,listing_property_id);
update public.assignments a set listing_property_id=s.property_id from public.property_calendar_sources s where a.calendar_source_id=s.id;
update public.reservations r set listing_property_id=s.property_id from public.property_calendar_sources s where r.calendar_source_id=s.id;
update public.assignments a set listing_property_id=case when a.property_id='4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a' and a.fixed_payout_amount=120 then '0d9f36d7-f530-48f8-b7c4-13f9c030b4d2'::uuid when a.property_id='fa83861a-8184-420e-8926-ef56b062c813' and a.fixed_payout_amount=120 then 'e1ce5551-6cf5-464c-b7b0-2c37e5960910'::uuid else a.property_id end where a.ledger_entry_id is not null and a.owner_id='d5b29d86-8e21-444b-8524-901e2107d96b';
