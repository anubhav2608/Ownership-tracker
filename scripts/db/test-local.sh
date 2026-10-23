#!/usr/bin/env bash
# Run the migrations and pgTAP tests on a plain local Postgres (no Docker needed).
# Needs psql, pg_prove and the pgTAP extension, plus a role that can create
# databases. With Docker available, prefer `npx supabase start && npx supabase test db`.
#
#   PGHOST=localhost PGUSER=postgres scripts/db/test-local.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
db="ownership_test_$$"

createdb "$db"
trap 'dropdb --if-exists "$db"' EXIT

psql -q -v ON_ERROR_STOP=1 -d "$db" -f scripts/db/supabase-stub.sql
for migration in supabase/migrations/*.sql; do
  echo "Applying $(basename "$migration")"
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$migration"
done

pg_prove -d "$db" supabase/tests/database/*.test.sql
