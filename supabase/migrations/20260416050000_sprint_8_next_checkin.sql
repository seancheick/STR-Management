-- Sprint 8: Add next_checkin_at to assignments for turnover window calculation
-- This column stores the next guest's check-in time so the turnover window
-- (checkout → next check-in) can be displayed and validated.

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS next_checkin_at TIMESTAMPTZ;

COMMENT ON COLUMN assignments.next_checkin_at IS
  'Next guest check-in time. Populated from iCal sync by pairing consecutive reservation events. '
  'Enables turnover window calculation: next_checkin_at - checkout_at = available cleaning window.';
