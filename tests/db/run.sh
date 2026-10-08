#!/usr/bin/env bash
# Applies every migration to a fresh local Postgres database on top of a
# Supabase stub, then runs the SQL security tests. Never touches a Supabase
# project. Needs a running local Postgres; point it with PGHOST/PGPORT/PGUSER.
#   npm run test:db
#   PGPORT=54329 npm run test:db
set -euo pipefail
export LC_ALL=C
cd "$(dirname "$0")/../.."

DB="${TEST_DB_NAME:-str_ops_security_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}" -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}")

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>&1 | grep -v NOTICE || true

"${PSQL[@]}" -d "$DB" -f tests/db/supabase-stub.sql
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null 2>&1 || { echo "Migration failed: $f"; "${PSQL[@]}" -d "$DB" -f "$f"; exit 1; }
done
echo "Applied $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') migrations."

for t in tests/db/*.test.sql; do
  echo "== $t"
  if ! out=$("${PSQL[@]}" -t -d "$DB" -f "$t" 2>&1); then
    echo "$out" | grep -E "ERROR|FAIL"
    exit 1
  fi
  echo "$out" | grep -E "passed"
done
echo "DB security tests passed."
