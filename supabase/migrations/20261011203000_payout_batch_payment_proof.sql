-- Persist report payment proof on entries so owner and cleaner RLS views agree.
create or replace function public.propagate_payout_batch_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'paid' and new.paid_at is not null then
    update public.payout_entries
      set paid_at = new.paid_at
      where batch_id = new.id and owner_id = new.owner_id
        and status = 'included' and paid_at is null;
  end if;
  return new;
end;
$$;
revoke all on function public.propagate_payout_batch_payment() from public, anon, authenticated;
create trigger payout_batch_payment_proof
  after insert or update of status, paid_at on public.payout_batches
  for each row execute function public.propagate_payout_batch_payment();
update public.payout_entries e set paid_at = b.paid_at
from public.payout_batches b
where b.id = e.batch_id and b.owner_id = e.owner_id
  and b.status = 'paid' and b.paid_at is not null
  and e.status = 'included' and e.paid_at is null;
