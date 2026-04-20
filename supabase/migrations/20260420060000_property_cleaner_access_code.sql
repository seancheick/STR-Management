-- Sprint 17 — permanent per-property door/gate code set by owner on the physical lock.
-- Appears on every cleaner job for that property; falls back when the per-booking
-- assignments.access_code is null. _set_at powers a "rotate every 90 days" nudge.

alter table public.properties
  add column if not exists cleaner_access_code text,
  add column if not exists cleaner_access_code_set_at timestamptz;

comment on column public.properties.cleaner_access_code
  is 'Permanent code the cleaner uses on this property''s lock. Owner rotates by typing a new code into the Yale/August app and saving it here.';
comment on column public.properties.cleaner_access_code_set_at
  is 'When the cleaner_access_code was last updated. Used for stale-code reminders.';

-- Only touch set_at when the code value actually changed (not on every save of the property form).
create or replace function public.touch_cleaner_access_code_set_at()
returns trigger
language plpgsql
as $$
begin
  if new.cleaner_access_code is distinct from old.cleaner_access_code then
    new.cleaner_access_code_set_at = case
      when new.cleaner_access_code is null then null
      else timezone('utc', now())
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_cleaner_access_code_set_at on public.properties;
create trigger trg_touch_cleaner_access_code_set_at
before update on public.properties
for each row
execute function public.touch_cleaner_access_code_set_at();
