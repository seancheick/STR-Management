-- Owner requested manual selection for Longmont future cleanings.
-- Preserve before-images; pending imports only, never accepted/started work.
insert into public.ops_reconciliation_audit(owner_id,run_key,table_name,row_id,before_record)
select owner_id,'owner-selected-future-cleaners-2026-10-11','properties',id,to_jsonb(p)
from public.properties p where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b'
and id in ('4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','0d9f36d7-f530-48f8-b7c4-13f9c030b4d2','fa83861a-8184-420e-8926-ef56b062c813','e1ce5551-6cf5-464c-b7b0-2c37e5960910','efd291a1-35ba-4e94-8c18-0a07c8c2fd95')
on conflict do nothing;
update public.properties set default_cleaner_id=null where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b'
and id in ('4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','0d9f36d7-f530-48f8-b7c4-13f9c030b4d2','fa83861a-8184-420e-8926-ef56b062c813','e1ce5551-6cf5-464c-b7b0-2c37e5960910','efd291a1-35ba-4e94-8c18-0a07c8c2fd95');
insert into public.ops_reconciliation_audit(owner_id,run_key,table_name,row_id,before_record)
select owner_id,'owner-selected-future-cleaners-2026-10-11','assignments',id,to_jsonb(a)
from public.assignments a where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b'
and source_type='ical' and status='assigned' and ack_status='pending'
and cleaner_id='7e57f656-a7b1-45cc-83a9-958e9dc1d9d5' and due_at>now()
on conflict do nothing;
update public.assignments set cleaner_id=null,status='unassigned',ack_status='pending'
where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b'
and source_type='ical' and status='assigned' and ack_status='pending'
and cleaner_id='7e57f656-a7b1-45cc-83a9-958e9dc1d9d5' and due_at>now();
