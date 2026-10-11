create unique index one_live_feed_cleaning_per_checkout
on public.assignments(owner_id,property_id,checkout_at)
where source_type='ical' and assignment_type='cleaning' and status<>'cancelled' and checkout_at is not null;
