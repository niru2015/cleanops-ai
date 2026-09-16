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
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/supabase/migrations/20260915160856_cleanops_foundation.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/supabase/seed.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$test_port" -U postgres -d cleanops_test \
  -f "$repository_root/tests/database/rls-boundaries.sql" >/dev/null

echo "CLEAN-002 migration, seed and RLS boundary checks passed on PostgreSQL."
