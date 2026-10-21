# Automatic calendar sync

Production schedules `/api/cron/sync-calendars` daily at `08:00 UTC` through Vercel Cron. The current Hobby plan runs daily jobs within the scheduled hour: approximately 4–5 AM Eastern during daylight saving time, 3–4 AM during standard time. This is a daily refresh, not continuous channel synchronization. Schedule and Calendar Sync also provide **Sync all** for an immediate refresh.

`CRON_SECRET` must be configured in production. The endpoint loads all active, non-retired feeds for active properties, then processes them serially so alternate bedroom listings sharing a physical unit do not race. A feed failure does not prevent the remaining feeds from running. Failed feeds return a non-success response and remain visible in sync history; a source-list read failure does not count as an empty successful run.

Sync reconciliation preserves jobs once their checkout has arrived, even when providers remove departed stays from their feeds. Upcoming bookings genuinely removed or moved by the provider still reconcile normally. Repeated syncs reuse existing physical-unit cleaning jobs.

Owner calendar views refresh on database changes, returning to the browser, and every minute while visible. Cleaning tags have their own lane beneath reservation bars, including on same-day checkouts and check-ins. A job with no cleaner displays **Assign cleaner**; an assigned job displays its cleaner and response status. Sync does not choose a cleaner automatically.


Hostex reservations are reconciled after the iCal feeds, both in the scheduled job and manual refreshes. Manual refreshes are restricted to the signed-in workspace. Once linked to a Hostex stay, a job follows that stay rather than disappearing because a backup iCal feed dropped it. Same-day arrival information is refreshed even when the checkout has not moved.

Hostex imports use the stay identity (a reservation can contain several stays). Replaced bookings preserve an existing turnover on that physical unit/day; reaccepted bookings can restore their sync-cancelled job. Started work and financially locked jobs require review. Job/checklist creation and cancellation-marker/review-issue creation each commit together. A partial provider failure retains completed work, reports the failure, and refreshes the open calendar.
