begin;
insert into public.ops_reconciliation_audit(owner_id,run_key,table_name,row_id,before_record)
select owner_id,'longmont-offline-2026-10-11','assignments',id,to_jsonb(a) from public.assignments a where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b' on conflict(run_key,table_name,row_id) do nothing;
insert into public.ops_reconciliation_audit(owner_id,run_key,table_name,row_id,before_record)
select owner_id,'longmont-offline-2026-10-11','properties',id,to_jsonb(p) from public.properties p where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b' on conflict(run_key,table_name,row_id) do nothing;
update public.properties set timezone='America/New_York',default_cleaner_id='7e57f656-a7b1-45cc-83a9-958e9dc1d9d5' where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b' and id in ('4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','fa83861a-8184-420e-8926-ef56b062c813','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','0d9f36d7-f530-48f8-b7c4-13f9c030b4d2','e1ce5551-6cf5-464c-b7b0-2c37e5960910');
update public.properties set physical_unit_id='4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a' where id='0d9f36d7-f530-48f8-b7c4-13f9c030b4d2' and owner_id='d5b29d86-8e21-444b-8524-901e2107d96b';
update public.properties set physical_unit_id='fa83861a-8184-420e-8926-ef56b062c813' where id='e1ce5551-6cf5-464c-b7b0-2c37e5960910' and owner_id='d5b29d86-8e21-444b-8524-901e2107d96b';
create temp table expected_cleanings(ledger_id uuid,job_id uuid,property_id uuid,job_date date,amount numeric,description text) on commit drop;
insert into expected_cleanings values
('a5b58c03-05cf-4887-a389-06428ced5cda','60b833a7-a59b-432c-95d0-0587f002ed33','fa83861a-8184-420e-8926-ef56b062c813','2026-01-11','90.00','2nd Floor'),
('dab29e37-d5dc-48a3-af09-a1f1c75254b0','22b206d8-59bf-4113-896e-43825015cad5','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-01-26','75.00','Basement'),
('081dcd83-e486-4ae8-a4cf-9017309b433e','d52114c0-848e-4276-883f-70a21a01fcf1','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-02-03','75.00','Basement'),
('c69e9a8a-3fef-4bd0-bf4a-429fc9fd5413','fcca8bb4-be4e-405e-b841-5f83e7fd0f81','fa83861a-8184-420e-8926-ef56b062c813','2026-02-04','90.00','2nd Floor'),
('0733b8c2-d15f-4b6f-b484-6b5d27003872','6a4048ff-9d5c-437d-8689-3b66b7a5bc01','fa83861a-8184-420e-8926-ef56b062c813','2026-02-10','120.00','2nd Floor (3BR)'),
('20552760-6c26-43d3-b147-0d6e85cf7ce5','bc2781cd-adc8-4d3b-9cd2-bb40159de7b6','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-02-11','75.00','Basement'),
('3bfcbb06-bab1-428d-8d2d-d10dc075f658','287144e2-5440-4844-9c0d-2f0a7ba03436','fa83861a-8184-420e-8926-ef56b062c813','2026-02-16','90.00','2nd Floor'),
('457dce17-767a-4be8-aca6-47437c0454e7','028a78b5-a66c-489d-a0b9-a09381ddebb2','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-02-16','75.00','Basement'),
('ef4def9c-aa7f-487e-9a10-913dcbde8a15','2f81e5a2-68ae-4e39-a525-eb9eb132e13c','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-02-18','90.00','1st Floor'),
('6e59d70b-a146-477b-9aac-d1197f0bd0bb','ee770e60-4b38-4732-b488-aed197b70483','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-03-01','90.00','1st Floor'),
('86298fe2-50d2-4c98-82fd-029d311639cf','5a4b4089-d325-4bd4-841d-3d46777101de','fa83861a-8184-420e-8926-ef56b062c813','2026-03-01','90.00','2nd Floor'),
('8a7d40d0-947a-4c19-b9bb-bd6e7cb8ae6e','301caf5d-6ecd-4738-93bf-9af374bb2c06','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-03-04','75.00','Basement'),
('4e6c7b11-47f0-46aa-ae33-00fec694f85e','9a7558d9-b884-4387-99c3-9a4d46621f3b','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-03-05','90.00','1st Floor'),
('68b1b159-8f0e-42bd-a61c-47afd7459b2a','944bf266-ed4d-47d4-b52c-c79c22a5385c','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-03-08','90.00','1st Floor'),
('ae59d634-1104-427f-91fa-bc2888306d49','94685b76-89e7-4552-a99e-ac61681c75a0','fa83861a-8184-420e-8926-ef56b062c813','2026-03-08','90.00','2nd Floor'),
('a0407803-b56b-43f4-b875-cb7a7c5a0ad8','ddfe83ba-7821-4e42-80b4-a092d5aaffd7','fa83861a-8184-420e-8926-ef56b062c813','2026-03-17','90.00','2nd Floor'),
('8d564ecd-c7e4-406a-863d-a0d07c5faac4','5e77b584-ceb5-4038-847a-7fcf183b7cba','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-03-23','90.00','1st Floor'),
('a69dfdcf-dea2-4348-b7d7-81403d63b733','b430c931-e7a2-43d9-b456-b847d5c51673','fa83861a-8184-420e-8926-ef56b062c813','2026-03-24','90.00','2nd Floor'),
('5bdc43dc-493e-43a9-8dcc-387845e1347d','b2e4c835-4d93-4096-bf13-1d48ca4a1ff9','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-03-27','90.00','1st Floor'),
('d7b1ee9c-0416-4f6e-9a55-6a3860a6019f','d4e5ad3b-43d7-4e18-8f97-e2374bef3501','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-03-28','75.00','Basement'),
('124f7f93-1042-4cae-906e-2aeebfac53c8','a5ccb1ae-f616-45ed-9ada-f287f0000679','fa83861a-8184-420e-8926-ef56b062c813','2026-03-29','90.00','2nd Floor'),
('5252df25-22c0-4dca-81c1-fc8b1069d5fb','fc03311e-46f7-4c4c-95a4-b280e4fa338b','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-03-30','90.00','1st Floor'),
('16d6544f-f85f-4697-9d67-5a53d2e14559','d4ba980d-3a77-4be3-b9d7-2077e4abb4fa','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-04-01','75.00','Basement'),
('3f3f60ec-3ebf-4074-aa68-57dd627bd836','1ed6c465-582e-4550-91bb-cf71a7bb9871','fa83861a-8184-420e-8926-ef56b062c813','2026-04-04','120.00','2nd Floor (3BR)'),
('b0cff8ef-b93b-4fc0-8b3b-10db0198ee4a','6a7e1562-75ac-436e-b3f2-1bf0ebf5b1b3','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-04-05','120.00','1st Floor (3BR)'),
('6e36eff6-2c05-4f1a-9da9-a55196e162f4','13d818d2-8d6a-415f-9b5a-8bdb040fbff5','fa83861a-8184-420e-8926-ef56b062c813','2026-04-06','120.00','2nd Floor (3BR)'),
('698bfdf5-d465-4bc0-bc10-b6c97bd083dc','22060335-e3a3-497f-8ae4-50a95009b213','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-04-08','75.00','Basement'),
('a3a6f11b-1e04-4cc3-9354-9b3b2dbb371f','176b7723-8caf-4de2-9f7c-b926ddf92cc5','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-04-10','90.00','1st Floor'),
('a8de4f06-bb1e-4e91-9d33-025e4926fa5b','0997cb7d-b7cf-4e7a-9839-9636cc8e0347','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-04-12','90.00','1st Floor'),
('4c9bb314-b968-4055-a15a-2023b1060aef','c17f6504-58f4-498c-98d5-04e75f6f964c','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-04-16','90.00','1st Floor'),
('b1617b3b-c466-42bc-ae59-e59c808c95ea','ea91d4f4-8bf5-479d-8fde-0c91d250016e','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-04-16','75.00','Basement'),
('1f8b7cc0-7025-4d5a-b86b-2c26f1b971d3','d803e1b8-79d6-4486-8cd8-609ea10c7421','fa83861a-8184-420e-8926-ef56b062c813','2026-04-19','90.00','2nd Floor'),
('9e7f1a11-9a98-423e-a58e-62a4903ca320','bf77ff5a-1353-40c5-b725-d718d02d13ca','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-04-20','90.00','1st Floor'),
('91dc39b2-9d41-4ba6-984f-f035bd23f7cc','51e0d3b4-37a5-4519-8e99-37acacc2ab52','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-04-21','75.00','Basement'),
('1913fe28-0c1d-4ef0-be7e-5fe9661eebd3','e6a891a0-87b5-4d82-97b5-7c41a5bef3f7','fa83861a-8184-420e-8926-ef56b062c813','2026-04-21','120.00','2nd Floor (3BR)'),
('7d18a22b-9378-4e14-bd25-8128b38c85fa','5d6f0179-381d-4778-aef9-3737e4dfc839','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-04-25','90.00','1st Floor'),
('b0b07a9d-1b65-46bd-a58b-bf3954c072ae','a6cea131-8ca7-452d-a231-ee45c3ec81f6','fa83861a-8184-420e-8926-ef56b062c813','2026-04-26','120.00','2nd Floor (3BR)'),
('707671e3-0a9a-46c8-bd51-0f1a229c66a5','3884ad8b-38dc-418a-99fd-c94277704d86','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-04-27','90.00','1st Floor'),
('a204e43f-eb88-4deb-b87b-38ffe1f83abf','19f27fd4-cadb-44d6-a99b-002b7bb1a34b','fa83861a-8184-420e-8926-ef56b062c813','2026-05-01','90.00','2nd Floor'),
('636c8245-e5cb-4250-aeb4-451fde9f771a','a72ef593-2321-4367-b522-2d0043de9fec','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-05-03','90.00','1st Floor'),
('23509f6d-e4b2-48a9-af8b-9e6b5d6ca474','bcbcd567-657b-4e9e-8dad-f611375fe071','fa83861a-8184-420e-8926-ef56b062c813','2026-05-04','90.00','2nd Floor'),
('1a183599-3e10-4b49-a0e2-b2c76f754fb8','1087ee50-5683-43d0-8f23-e124f88effae','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-05-04','75.00','Basement'),
('51268d09-bbf9-455c-a1b2-78ebf0f24aa6','a44de7d4-411c-499d-a4f1-f8c62f09cb0a','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-05-06','90.00','1st Floor'),
('09170e76-2cbb-4535-a3d4-e1bde97835f1','95de4a4f-2e23-437c-bd49-3ec8491d794f','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-05-07','75.00','Basement'),
('cd19f708-7822-4df7-a456-8f04ae0e2f48','948e6e70-34dd-46b0-84a2-c32f5bfeb421','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-05-10','90.00','1st Floor'),
('737e67dd-7cb4-4200-948b-8b2282e9ccd7','a611e40d-282e-4463-8716-700b68b355c3','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-05-11','75.00','Basement'),
('8d6df232-980a-4880-905b-bc3e4bd05b96','673f200b-2e6f-4065-9b55-b5e72c6a6dcf','fa83861a-8184-420e-8926-ef56b062c813','2026-05-13','90.00','2nd Floor'),
('c95f60f5-773c-487a-a8be-385689737457','cab09f36-d1f6-427a-b2fd-a81927b80f2c','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-05-15','90.00','1st Floor'),
('cb8472fe-752f-44a2-8d02-3e4e201cb357','59b52df7-6b63-4533-bb78-40c70a9afc35','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-05-15','75.00','Basement'),
('a724952b-07c2-43f1-a3d0-04295346a86d','34f91e61-f45c-4858-b1d5-9ce5552b587b','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-05-18','75.00','Basement'),
('0429fdbc-06c6-47ff-ab53-6dd27cd01288','1694a750-8e4f-47e6-ad63-5608bf2a94c7','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-05-18','90.00','1st Floor'),
('9245ff95-1f3a-4629-a3cb-d7bc12433002','e144d9b1-e6fa-482f-b2ed-d2cf1f0fd769','fa83861a-8184-420e-8926-ef56b062c813','2026-05-18','120.00','2nd Floor (3BR)'),
('25551dc0-b35b-45e9-926a-2934030d0d55','8d1677b4-81ba-48bf-b0db-52ab55a4ffcb','fa83861a-8184-420e-8926-ef56b062c813','2026-05-23','90.00','2nd Floor'),
('b19e9505-4c50-46de-ae15-e795467f06a4','9850615e-8492-4ed4-95da-95309565f69b','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-05-25','75.00','Basement'),
('e6dcedf1-7af1-4422-8f0f-b02931f5da9b','7e220794-1bc2-4038-8c4e-345bc4e60a41','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-05-25','90.00','1st Floor'),
('d718a21b-d780-4d3a-ac01-d1903b516b88','608c8ec8-13de-47e4-903f-8e0f2b07134b','fa83861a-8184-420e-8926-ef56b062c813','2026-05-29','90.00','2nd Floor'),
('1357a973-2991-482e-8d9e-e54d5e4bedb2','134c1f19-2827-41cc-9570-bfbe48dab1b0','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-05-30','90.00','1st Floor'),
('f3dfd7b9-00d0-4c7b-b7af-fc7db39a377c','12eefea9-b022-460b-a2a1-c74ff9adc7de','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-05-31','120.00','1st Floor (3BR)'),
('1d5636ba-cf0e-4bcb-85cf-3d1acfd84f07','17c3595b-2435-50e6-9afa-4e82566e13e8','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-06-05','90.00','1st Floor'),
('6c107706-db41-4683-acc2-03aa0c6ba1c0','22690aa8-474c-5a35-b35c-009d0bca6386','fa83861a-8184-420e-8926-ef56b062c813','2026-06-05','90.00','2nd Floor'),
('e814c7a5-0907-4e32-b993-afaeb7a07904','db122b34-cd5b-4f92-a7a9-7cc302b353dd','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-06-07','75.00','Basement'),
('9096b6c6-0e8f-46ae-ab32-6eb9204b06b4','6723fa6f-c2bf-5960-b2cc-c7d2adf0e824','fa83861a-8184-420e-8926-ef56b062c813','2026-06-08','120.00','2nd Floor (3BR)'),
('a42ac64c-6abe-4bd9-8ec7-2b9b7ab820b7','b52cb9ce-1ca3-5b69-a6cf-0ca5cfcbb432','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-06-09','90.00','1st Floor'),
('485b6f1e-83fd-49fc-ba13-6b7605460b7a','c81bfefd-486c-4c88-9789-417596c553f9','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-06-12','90.00','1st Floor'),
('439edac5-4b45-44cd-9521-d8139b86de7a','93e2c635-f418-51da-8d80-f2d03b542af1','fa83861a-8184-420e-8926-ef56b062c813','2026-06-12','120.00','2nd Floor (3BR)'),
('a49223dd-6e58-4c7d-9700-4af2ca2e50a6','7b54d10b-bb36-4264-b273-670fd5eae651','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-06-15','90.00','1st Floor'),
('e6f44a58-4746-44f8-bd87-b86bb09198a9','0252c031-bc18-5956-a01b-295ecb1dc95b','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-06-17','90.00','1st Floor'),
('2a7d3f38-5b42-4395-aa6a-c0a90aa383d7','271a97da-ad78-59ee-bfc9-c1e2b64ec757','fa83861a-8184-420e-8926-ef56b062c813','2026-06-20','120.00','2nd Floor (3BR)'),
('4c2c409d-6e72-4a64-bfa2-18d06ba02493','3f6d93d1-ae31-4564-8cb3-4ac4451827e5','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-06-20','90.00','1st Floor'),
('d78de133-20c6-4c46-a8f7-7184b67b6ddb','0548a88c-886e-4a50-94d8-c362b4c306d0','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-06-27','75.00','Basement'),
('e7777063-0543-4105-8f3e-3b558330976e','bdd9c690-f6e0-4b03-9cf0-7bd93877a771','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-06-27','90.00','1st Floor'),
('0807dd93-5458-41ef-9d57-261f58cbc438','fad4b3b7-59b8-5bf4-8b87-e0ae81320cca','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-06-30','75.00','Basement'),
('f2c2fb82-9d75-4e2a-8f68-893bab278784','cd68a2d3-6313-541d-9773-8b4c22be6115','fa83861a-8184-420e-8926-ef56b062c813','2026-07-01','90.00','2nd Floor'),
('58e878c4-ad70-408a-abf6-7816b8758a0e','2330b30d-60a6-5dac-944f-c104527941da','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-07-02','90.00','1st Floor'),
('00389704-6591-4b37-b9b9-2d5d3f9d219c','e38762f5-d226-505e-b3de-733c2b47b497','fa83861a-8184-420e-8926-ef56b062c813','2026-07-06','90.00','2nd Floor'),
('a0f011fd-398c-41d2-9eeb-e0ff8d776eeb','623f449e-a506-5ddb-a7fc-079a61f6742a','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-07-06','75.00','Basement'),
('46729ac8-c3e1-43f7-93c8-5f498636591d','71d4dbec-fee3-435d-98f3-dc6a9452e9b4','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-07-08','90.00','1st Floor'),
('37b2a9fc-13e4-49a3-bd65-08613eb77a73','ead69ca3-3c85-4f6d-ba55-b28379ef1259','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-07-11','75.00','Basement'),
('1d99041d-3ab2-40b6-8bd3-a756900634fa','a906ea68-9761-4a6e-9e94-4071aabcd830','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-07-13','75.00','Basement'),
('040d45b6-75a0-417b-b9a2-11b5427c7b49','6f857fcd-17f6-4db4-afd4-84e7e22f7322','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-07-13','120.00','1st Floor (3BR)'),
('ccb218f3-3edf-44bb-b16a-cdc1399b72d8','0c9c98fd-06b3-5f7f-a4b5-2a3a3c1f7a73','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-07-16','75.00','Basement'),
('b8346be5-c82c-423f-aed2-f65de276a3e9','1eeb8e3e-da93-59ee-9e3c-dfd27f4515b4','fa83861a-8184-420e-8926-ef56b062c813','2026-07-17','120.00','2nd Floor (3BR)'),
('3fb7419f-e7af-4bdb-a273-60232279be84','4fe50e3b-279f-576d-b035-331f90537bfa','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-07-20','120.00','1st Floor (3BR)'),
('bb7bf318-221f-4008-8776-3849254c51af','78373674-e15f-40b3-a106-94cc1dd27d38','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-07-22','75.00','Basement'),
('22484c26-8bd3-4596-af9b-fe1ff40c51ef','34bcc6c9-a0b5-49ac-be27-84b652ba8549','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-07-24','90.00','1st Floor'),
('455df885-5709-4630-8855-000b657b3dd2','508b171a-a9ae-4b0f-9645-1fe2e9c45bf0','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-07-26','75.00','Basement'),
('16b64028-79ed-4815-b8a7-3968512c30d2','5f62891c-1cd2-419f-8b46-292c07d54ef7','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-07-26','120.00','1st Floor (3BR)'),
('513c3b18-843c-4c41-bce0-9bf53bfa2d18','fe65812c-4e33-5690-8ec1-60e1608a75eb','fa83861a-8184-420e-8926-ef56b062c813','2026-07-26','120.00','2nd Floor (3BR)'),
('048c6ba4-a94a-439e-a348-970ffd2e66ce','675c40ec-19e7-42f8-acfd-20a648d622f9','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-07-30','75.00','Basement'),
('10f833dc-6431-4095-9288-f5b594570372','0f37651e-6662-5941-ac99-8471fb762678','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-07-30','120.00','1st Floor (3BR)'),
('c278b70d-bc8b-4d68-b0f3-f38c3ccf5150','26aa47f7-08c8-5441-883f-c9c92ba38dc2','fa83861a-8184-420e-8926-ef56b062c813','2026-07-31','90.00','2nd Floor'),
('e98af999-0855-4eb5-82c4-c75f9c1ad3aa','c598353a-8da5-442e-9d5a-9e0c07bc1906','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-08-02','75.00','Basement'),
('f6ef35d2-0d03-4689-aa1d-65ff80a1e0d5','9f7fb38b-5c44-5f76-9872-ca585a072ba1','fa83861a-8184-420e-8926-ef56b062c813','2026-08-02','120.00','2nd Floor (3BR)'),
('365279b3-9cb3-433a-9cbd-756a3a6079a1','06ef0770-4257-4296-a123-e30e70ad8833','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-08-04','120.00','1st Floor (3BR)'),
('d6e9e3ab-18e2-49a7-acd2-a08621cf86c1','17e03894-1bec-48a3-84f4-2fdf806fc384','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-08-08','120.00','1st Floor (3BR)'),
('419d5e17-b4dd-483f-a1a6-79f0c0ceacc9','530fbe14-2f96-5dd9-b74f-5c9e740ee6ef','fa83861a-8184-420e-8926-ef56b062c813','2026-08-08','90.00','2nd Floor'),
('8881e414-3e4b-4849-9ef2-b4f65d61c09e','283023c7-49b1-4acf-af5e-03975c22a28c','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-08-10','75.00','Basement'),
('7e092cc1-bdb3-475f-8f31-a57461ac1c47','a809f603-692e-5a12-9e5b-e066cf43277e','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-08-12','90.00','1st Floor'),
('a471b3fc-e58f-4c79-ba69-00ab86a659ed','8baac627-cbf7-5635-a1fe-da74f94d33bf','fa83861a-8184-420e-8926-ef56b062c813','2026-08-13','120.00','2nd Floor (3BR)'),
('edeb6cc4-20ee-4c4f-a478-56a821e0b7b0','264347c7-b22f-4121-aeb5-fdc62e7cb788','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-08-15','75.00','Basement'),
('a787fb46-2fc7-4ab0-a9bb-acb431b4fa0f','af597edd-218d-5c3c-b6be-e924fe8ebeed','fa83861a-8184-420e-8926-ef56b062c813','2026-08-16','120.00','2nd Floor (3BR)'),
('d84c9c1c-1d75-460a-9e14-3b00b8f80667','0b8cb5e2-8a5d-4778-b635-d7c07bc4b814','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-08-17','75.00','Basement'),
('2061e78f-18f4-4c03-9de9-aaff6784c76b','f509870e-ca9b-5b20-a780-ff7bae1d22f1','fa83861a-8184-420e-8926-ef56b062c813','2026-08-19','120.00','2nd Floor (3BR)'),
('89cac2b9-baf6-46af-ba93-d616d8a61476','aa5b231c-ebf9-548e-bd2f-5cc106777910','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-08-20','120.00','1st Floor (3BR)'),
('298f8ee6-66d1-46a1-adc3-ebf714604dfa','44b0f033-0335-4da5-b656-068105a56f3f','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-08-22','75.00','Basement'),
('2fc3cce6-fc16-43e4-90cb-02f2a2859b65','85e8fbc6-1ca0-54d0-8c69-15f69ef07f05','fa83861a-8184-420e-8926-ef56b062c813','2026-08-24','120.00','2nd Floor (3BR)'),
('fe66b224-748e-460e-b325-48fe1db2e5b9','5a6725fb-fc96-41c0-9798-2fd39d21d4eb','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-08-24','75.00','Basement'),
('1aa5c767-b634-47a5-9ecc-baa39931bb21','3d6fc905-7596-5ea1-9c3d-0f3959f0670e','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-08-27','120.00','1st Floor (3BR)'),
('8c0dde3b-a67f-4db1-b157-bfefd655c90f','ad18093f-ac69-53f2-b6a9-49f072ef36a5','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-08-30','90.00','1st Floor'),
('f9bde75c-7169-409c-93b8-19b60ec7d16b','3df5ddb8-8c05-5614-8735-b87afc38c70e','fa83861a-8184-420e-8926-ef56b062c813','2026-08-30','120.00','2nd Floor (3BR)'),
('0e7bb7c5-bba5-4471-ad99-2229480219ab','1fa8e7c4-8b14-5c9e-a1c9-d920ab8fefff','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-09-03','90.00','1st Floor'),
('a90f293c-a6bb-424d-bd12-ddb6ccf9c8de','4c02a53b-4ce5-544d-b079-3b8572bb0332','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-09-07','90.00','1st Floor'),
('e4e2b0a5-eb6e-42d2-b8e3-5ba5c52129c5','c0662af8-609d-5d15-8c1a-f24ea08a68d1','fa83861a-8184-420e-8926-ef56b062c813','2026-09-07','120.00','2nd Floor (3BR)'),
('5780be12-5bef-409a-bbb6-fdd36a20dfa9','12994a8b-0ad6-50a2-aaa8-f1a4229ccdd7','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-09-10','75.00','Basement'),
('00cd278f-bcf8-4238-8557-0fe1f601b213','2a264b0a-d648-45e4-9c7e-884de1b52dd9','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-09-14','120.00','1st Floor (3BR)'),
('bff133f2-56df-4e5c-87fb-cef60a4d46e0','71d1f656-2ba4-5746-a44f-18cd13f86f4f','fa83861a-8184-420e-8926-ef56b062c813','2026-09-15','120.00','2nd Floor (3BR)'),
('4662b979-3eda-42bb-94ca-9f0aa6deb338','4c18de5b-dcee-41f9-88fd-f2c61e5ab809','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-09-19','75.00','Basement'),
('d73b4411-e89e-4915-bc41-523043d2f457','674ae77d-4d71-50e1-b9b3-07737900caf2','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-09-19','90.00','1st Floor'),
('9ff1e150-92eb-4658-a6db-41b39478ad61','bb6eb71f-6641-5037-ab95-3e8275336ca5','fa83861a-8184-420e-8926-ef56b062c813','2026-09-21','120.00','2nd Floor (3BR)'),
('406fd13c-1f38-4e77-a568-dfeff8de5fc0','e382ed3e-788d-5453-af1a-8918067f7369','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-09-23','75.00','Basement'),
('b3142be8-6d22-46b0-9770-3c02a67cb002','6d003c9a-78ba-5077-8ba5-f4f066fd02d0','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-09-23','90.00','1st Floor'),
('ac5133d1-8924-499d-bea0-64882ce0ecc1','2fdb21c9-4c71-493d-a03b-22a50cbdec56','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-09-26','90.00','1st Floor'),
('59a121e5-13dc-428f-a2ac-5e4090f25199','c2537743-a53b-4ab0-aaab-55dd99b54452','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-09-27','120.00','1st Floor (3BR)'),
('306be1e9-dcc1-432e-b17b-c9364ee102eb','d18bf66e-2931-52f8-bb6a-5c0607e4633f','fa83861a-8184-420e-8926-ef56b062c813','2026-09-27','120.00','2nd Floor (3BR)'),
('5cb90a5c-cdd2-4236-a4ef-7b17089d86a2','7b6e38f2-de3c-5a4e-ba12-9383688e9e6c','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-09-30','75.00','Basement'),
('0df991bb-6018-4cde-ab0a-c596da0807ac','612801fe-1849-42a6-9d32-2b2fa8f55075','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-10-01','90.00','1st Floor'),
('e6d8ca67-f7a2-464d-b8dd-9671e23b031c','3a0d4a08-a153-56e5-9615-15fc4059a496','fa83861a-8184-420e-8926-ef56b062c813','2026-10-04','120.00','2nd Floor (3BR)'),
('3944be73-f8c8-4afa-82de-fc71ae269ce1','08aa1595-23be-43d4-aa4e-bae136a3d3e2','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-10-05','75.00','Basement'),
('09d851df-e08b-4c6c-967c-36eba94d28ec','f06ecf1d-638d-4075-b8c3-5ed5de78d9ba','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-10-06','120.00','1st Floor (3BR)'),
('b4ea9fce-0af6-476a-96a6-95fe6774c6f5','784fe526-d675-58e7-8e18-1782aa256570','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-10-07','75.00','Basement'),
('11ca6d3b-8149-4ece-92ae-7e1e8dd5706a','f5eb9278-2caa-4872-bdfd-538f9e8a67bb','4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','2026-10-09','90.00','1st Floor'),
('2af1ded6-cbfd-494c-96e3-422a0d128c78','3c6757ff-5e30-4927-8bee-2202eaa7df03','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','2026-10-10','75.00','Basement');
-- Preserve all superseded jobs as cancelled audit history. Unmatched past
-- feed tasks are archived, not asserted completed without ledger evidence.
update public.assignments set status='cancelled',ack_status='expired',review_notes=coalesce(review_notes||E'\n','')||'Archived by owner reconciliation: duplicate or unsupported historical feed task; see offline ledger.'
where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b' and property_id in ('4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a','fa83861a-8184-420e-8926-ef56b062c813','efd291a1-35ba-4e94-8c18-0a07c8c2fd95','0d9f36d7-f530-48f8-b7c4-13f9c030b4d2','e1ce5551-6cf5-464c-b7b0-2c37e5960910') and status not in ('cancelled','in_progress','needs_reclean')
and (coalesce(checkout_at,due_at) at time zone 'America/New_York')::date<='2026-10-10'
and id not in(select job_id from expected_cleanings);
insert into public.assignments(id,owner_id,property_id,cleaner_id,assignment_type,status,ack_status,priority,due_at,fixed_payout_amount,source_type,source_reference,created_by_user_id)
select job_id,'d5b29d86-8e21-444b-8524-901e2107d96b',property_id,'7e57f656-a7b1-45cc-83a9-958e9dc1d9d5','cleaning','approved','pending','normal',(job_date+time '15:00') at time zone 'America/New_York',amount,'manual','offline-ledger:'||ledger_id,'d5b29d86-8e21-444b-8524-901e2107d96b' from expected_cleanings
on conflict(id) do nothing;
update public.assignments a set property_id=e.property_id,cleaner_id='7e57f656-a7b1-45cc-83a9-958e9dc1d9d5',status='approved',due_at=(e.job_date+time '15:00') at time zone 'America/New_York',fixed_payout_amount=e.amount,
completed_at=(e.job_date+time '15:00') at time zone 'America/New_York',approved_at=coalesce(a.approved_at,now()),reviewed_at=now(),reviewed_by_id='d5b29d86-8e21-444b-8524-901e2107d96b',review_notes='Owner-confirmed offline cleaning: '||e.description||'. Recorded from dated ledger; no in-app acceptance or photo proof.',ledger_entry_id=e.ledger_id,
paid_at=null,payment_method=null,payment_reference=null
from expected_cleanings e where a.id=e.job_id and a.owner_id='d5b29d86-8e21-444b-8524-901e2107d96b';
-- Historic 3-bedroom records now belong to the physical floor; source
-- listing configurations and amounts remain in the audit/ledger.
update public.assignments set property_id='4f1bdf64-1d0b-4eb4-b4bb-a527aa37dd6a' where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b' and property_id='0d9f36d7-f530-48f8-b7c4-13f9c030b4d2';
update public.assignments set property_id='fa83861a-8184-420e-8926-ef56b062c813' where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b' and property_id='e1ce5551-6cf5-464c-b7b0-2c37e5960910';
-- Old source jobs are cancelled before Hostex replaces the current schedule.
update public.assignments set status='cancelled',ack_status='expired',review_notes=coalesce(review_notes||E'\n','')||'Old calendar source replaced by Hostex; refreshed jobs come from current feed.'
where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b' and source_type='ical' and status in ('unassigned','assigned','confirmed') and (coalesce(checkout_at,due_at) at time zone 'America/New_York')::date>'2026-10-10';
update public.notifications n set seen_at=coalesce(seen_at,now()),status=case when status='pending' then 'skipped'::public.notification_status else status end
where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b' and assignment_id in(select id from public.assignments where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b' and status in('approved','cancelled'));
DO $$ begin
if (select count(*) from assignments where owner_id='d5b29d86-8e21-444b-8524-901e2107d96b' and cleaner_id='7e57f656-a7b1-45cc-83a9-958e9dc1d9d5' and status='approved' and ledger_entry_id is not null)<>132 then raise exception 'Expected 132 canonical cleanings'; end if;
if (select sum(amount) from cleaner_ledger_entries where cleaner_id='7e57f656-a7b1-45cc-83a9-958e9dc1d9d5')<>2124 then raise exception 'Ledger balance changed'; end if;
end $$;
commit;
