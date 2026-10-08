#!/usr/bin/env bash
# Applies every migration to a fresh local Postgres database on top of a
# Supabase stub, then runs the SQL security tests. Never touches a Supabase
# project.
#   npm run test:db                 # uses Postgres on 127.0.0.1:5432 if one is
#                                   # running, otherwise starts a throwaway one
#   PGPORT=54329 npm run test:db    # use a specific running server
# Needs the Postgres client and server binaries (brew install postgresql).
set -euo pipefail
export LC_ALL=C   # postgres refuses to start under some macOS locales
export PGOPTIONS="-c client_min_messages=warning"
cd "$(dirname "$0")/../.."

HOST="${PGHOST:-127.0.0.1}"
PORT="${PGPORT:-5432}"
USER_NAME="${PGUSER:-postgres}"
DB="${TEST_DB_NAME:-str_ops_security_test}"

if ! pg_isready -q -h "$HOST" -p "$PORT"; then
  if [[ -n "${PGPORT:-}" || -n "${PGHOST:-}" ]]; then
    echo "No Postgres at $HOST:$PORT. Start one there, or unset PGHOST/PGPORT to use a temporary server." >&2
    exit 1
  fi
  TMP_PG="$(mktemp -d)"
  PORT=54329
  USER_NAME=postgres
  trap 'pg_ctl -D "$TMP_PG/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP_PG"' EXIT
  echo "No Postgres on $HOST:5432; starting a temporary one on port $PORT."
  initdb -D "$TMP_PG/data" -U postgres --auth=trust >/dev/null
  # TCP only: the default socket path under $TMPDIR is too long on macOS.
  pg_ctl -D "$TMP_PG/data" -l "$TMP_PG/server.log" -w \
    -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null \
    || { cat "$TMP_PG/server.log" >&2; exit 1; }
fi

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "$USER_NAME" -h "$HOST" -p "$PORT")

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"

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
