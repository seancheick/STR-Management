# Automatic calendar sync

Production schedules `/api/cron/sync-calendars` daily at `08:00 UTC` through Vercel Cron. The current Hobby plan runs daily jobs within the scheduled hour: approximately 4–5 AM Eastern during daylight saving time, 3–4 AM during standard time. This is a daily refresh, not continuous channel synchronization. Schedule and Calendar Sync also provide **Sync all** for an immediate refresh.

`CRON_SECRET` must be configured in production. The endpoint loads all active, non-retired feeds for active properties, then processes them serially so alternate bedroom listings sharing a physical unit do not race. A feed failure does not prevent the remaining feeds from running. Failed feeds return a non-success response and remain visible in sync history; a source-list read failure does not count as an empty successful run.

Sync reconciliation preserves jobs once their checkout has arrived, even when providers remove departed stays from their feeds. Upcoming bookings genuinely removed or moved by the provider still reconcile normally. Repeated syncs reuse existing physical-unit cleaning jobs.

Owner calendar views refresh on database changes, returning to the browser, and every minute while visible. Cleaning tags have their own lane beneath reservation bars, including on same-day checkouts and check-ins. A job with no cleaner displays **Assign cleaner**; an assigned job displays its cleaner and response status. Sync does not choose a cleaner automatically.
