-- Execute on the linked database after importing Mary. No data mutations.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57f656-a7b1-45cc-83a9-958e9dc1d9d5","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.cleaner_ledger_entries) <> 148 then raise exception 'Mary cannot read full ledger'; end if;
  if (select sum(amount) from public.cleaner_ledger_entries) <> 2124 then raise exception 'Wrong balance'; end if;
  if has_table_privilege('authenticated','public.cleaner_ledger_entries','INSERT') then raise exception 'Cleaner can insert payments'; end if;
end $$;
set local request.jwt.claims = '{"sub":"7677539d-94fd-4035-a59e-276b1f5c5eab","role":"authenticated"}';
do $$ begin
  if exists(select 1 from public.cleaner_ledger_entries) or exists(select 1 from public.cleaner_accounts) then raise exception 'Another cleaner can read Mary ledger'; end if;
end $$;
set local request.jwt.claims = '{"sub":"c97d0e91-c820-45e3-a20e-2dc84f6bde11","role":"authenticated"}';
do $$ begin
  if exists(select 1 from public.cleaner_accounts) then raise exception 'Another owner can read account'; end if;
end $$;
set local request.jwt.claims = '{"sub":"d5b29d86-8e21-444b-8524-901e2107d96b","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.cleaner_ledger_entries) <> 148 then raise exception 'Owner cannot read ledger'; end if;
  if has_table_privilege('anon','public.cleaner_ledger_entries','SELECT') then raise exception 'Public can read ledger'; end if;
end $$;
rollback;
