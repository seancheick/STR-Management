# Ledger reconciliation implementation

Use the owner's October 21 dev brief as the specification. Preserve historical lines and original payment proof. Writes require explicit approval, request IDs and owner authorization; reads remain available to read tokens.

1. Finance: append-only dated charge/payment corrections with exact-cent validation, transactional idempotency, tenant policies; integrate all financial summary and statement consumers. Give every statement entry assignment identity and editability/correction path. Fix imported entry lookups with structured business errors.
2. History: reference-only reservation CSV import, normalized channel/listing/stay data, deterministic deduplication and contextual stay lookup. Retired feeds release URLs. Do not infer cleaning charges from reservations.
3. Completion/payments: actual cleaned date separate from checkout; completion capture and explicit correction path; verified payment metadata and normalized reference duplicate checks under cleaner locks.
4. Shared agent registry generates REST/OpenAPI/MCP. Add guarded tools delegating shared actions. Maintain existing locked extras/scope behavior.
5. Regression unit/SQL tests, full unit/build/type/lint sequential, independent review. Apply migrations only after local checks. Snapshot live financial records, deploy main, post only the two authorized Mary corrections with stable UUIDs, replay and confirm 12984 charged / 12340 paid / 644 owed and unchanged payment records. Verify isolated fixture writes and cleanup.
6. Import actual channel files when provided. If unavailable, report that data loading remains pending; never claim nonexistent stays.
