#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_DIR="${DUMP_DIR:-"$ROOT_DIR/db_dumps"}"
DUMP_FILE="${1:-"$DUMP_DIR/interview_platform_current.sql"}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-interview}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-interview}"
POSTGRES_DB="${POSTGRES_DB:-interview_platform}"

mkdir -p "$(dirname "$DUMP_FILE")"

cd "$ROOT_DIR"

PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --quote-all-identifiers \
  > "$DUMP_FILE"

echo "Database dump written to: $DUMP_FILE"
