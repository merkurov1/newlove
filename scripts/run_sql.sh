#!/usr/bin/env bash
# scripts/run_sql.sh
# Выполните этот скрипт на машине/CI, где доступна БД (через DATABASE_URL env var)
# Использует psql для выполнения SQL файлов (Postgres).

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set."
  exit 1
fi

SQL_FILE=${1:-scripts/grants_for_public_read.sql}

echo "Running SQL file: $SQL_FILE"

# psql expects a connection string in DATABASE_URL
psql "$DATABASE_URL" -f "$SQL_FILE"

echo "Done."
