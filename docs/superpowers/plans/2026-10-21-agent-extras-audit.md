# Agent extras audit

Goal: ship the shared app/API extras behavior with durable safe retries, explicit editability and precise amounts.

- Audit current main tools/actions/SQL against scope correction and finance ownership.
- Add durable extra receipts/tombstones; authorize before replay; preserve paid/history/scope locks for new mutations.
- Expose editability/reason in get_job_pay and UI; normalize action validation; prevent amount rounding; describe removed-retry outcomes accurately.
- Regression-test tools, actions, SQL tenant and finance rules; build/typecheck/lint.
- Apply migration, deploy main, verify live reads and a disposable isolated fixture (never add test charges to real work), cleanup and verify permanent records unchanged.
