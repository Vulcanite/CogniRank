#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-interview}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-interview}"
POSTGRES_DB="${POSTGRES_DB:-interview_platform}"

if [[ "${1:-}" != "--yes" ]]; then
  cat <<USAGE
This will restore a database dump into '$POSTGRES_DB' and replace matching tables.

Usage:
  scripts/restore-db.sh --yes [dump-file]

Default dump file:
  db_dumps/interview_platform_current.sql
USAGE
  exit 2
fi

shift
DUMP_FILE="${1:-"$ROOT_DIR/db_dumps/interview_platform_current.sql"}"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "Dump file not found: $DUMP_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"

if [[ "${SKIP_DOCKER:-0}" != "1" ]]; then
  docker compose up -d "$POSTGRES_SERVICE"
fi

until PGPASSWORD="$POSTGRES_PASSWORD" pg_isready \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  >/dev/null 2>&1; do
  sleep 1
done

PGPASSWORD="$POSTGRES_PASSWORD" psql \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --file="$DUMP_FILE"

echo "Database restored from: $DUMP_FILE"
