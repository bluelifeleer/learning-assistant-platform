#!/usr/bin/env bash
set -euo pipefail

DATABASE="${1:-postgresql}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

case "$DATABASE" in
  postgresql)
    docker compose --profile postgresql up -d postgres
    ;;
  mysql)
    docker compose --profile mysql up -d mysql
    ;;
  all)
    docker compose --profile all up -d
    ;;
  *)
    echo "Usage: scripts/db-docker.sh [postgresql|mysql|all]" >&2
    exit 1
    ;;
esac

echo ""
echo "Database container started."
if [[ "$DATABASE" == "postgresql" || "$DATABASE" == "all" ]]; then
  echo "PostgreSQL: host=127.0.0.1 port=5432 database=learn_assistant username=learn_assistant password=learn_assistant"
fi
if [[ "$DATABASE" == "mysql" || "$DATABASE" == "all" ]]; then
  echo "MySQL:      host=127.0.0.1 port=3306 database=learn_assistant username=learn_assistant password=learn_assistant"
fi
echo "Open the console installer and use these values, or keep the defaults for PostgreSQL."
