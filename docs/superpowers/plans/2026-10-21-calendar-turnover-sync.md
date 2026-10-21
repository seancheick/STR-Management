# Calendar turnover and sync

Implement the owner's requested UI: one shared Sync all action/button on Schedule and Calendar Sync; partial failures visible and all active owner feeds attempted safely. Preserve current sync guardrails and refresh loaded windows after completion.

Calendar: check-in bars start halfway through arrival cell, checkout bars end halfway through departure cell, slanted edges distinguish arrival/departure. Shared civil-date geometry handles clipping and DST. Cleaner events retain a separate nonoverlapping lane and stay clickable on same-day checkout/check-in in timeline and month.

Verify pure geometry and sync ownership/partial-failure behavior with regression tests; full tests/build/type/lint; browser desktop/mobile with same-day turnovers and sync results. Review diff, push main and verify deployment.
