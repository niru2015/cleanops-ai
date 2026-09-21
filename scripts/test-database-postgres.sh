#!/usr/bin/env bash
set -euo pipefail

for required_command in initdb pg_ctl createdb psql; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Missing $required_command. Install PostgreSQL 17+ or run npm run test:db with Docker."
    exit 1
  fi
done

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/cleanops-postgres.XXXXXX")"
data_directory="$test_root/data"
test_port="${CLEANOPS_TEST_DB_PORT:-55432}"

cleanup() {
  if [[ -d "$data_directory" ]]; then
    pg_ctl -D "$data_directory" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$test_root"
}
trap cleanup EXIT

initdb -D "$data_directory" -U postgres --auth=trust --no-locale >/dev/null
pg_ctl -D "$data_directory" -o "-F -p $test_port" -w start >/dev/null
createdb -h 127.0.0.1 -p "$test_port" -U postgres cleanops_test

psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/supabase-compat.sql" >/dev/null
for migration in "$repository_root"/supabase/migrations/*.sql; do
  psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
    -f "$migration" >/dev/null
done
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/supabase/seed.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/rls-boundaries.sql" >/dev/null

psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/concurrent-accept.sql" >/dev/null &
first_accept_pid=$!
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/concurrent-accept.sql" >/dev/null &
second_accept_pid=$!
wait "$first_accept_pid"
wait "$second_accept_pid"

psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/durable-ingestion.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/operational-evidence.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/supervisor-quality-review.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/mobile-operations.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/incident-reporting.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/capped-openai-quality.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/official-whatsapp.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/normalized-finance.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/hosted-demo-reset.sql" >/dev/null

echo "CLEAN-002 through CLEAN-010 migrations, isolation, concurrency, reporting, release, AI budget, WhatsApp and hosted reset checks passed on PostgreSQL."
