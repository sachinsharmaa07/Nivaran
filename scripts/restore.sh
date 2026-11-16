#!/usr/bin/env bash
# scripts/restore.sh
# Restores PostgreSQL and MongoDB databases from a Nivaran backup archive (.tar.gz).
# Usage: ./scripts/restore.sh /path/to/nivaran_backup_TIMESTAMP.tar.gz

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_archive.tar.gz>" >&2
  exit 1
fi

ARCHIVE_PATH="$1"
if [ ! -f "${ARCHIVE_PATH}" ]; then
  echo "Error: Backup archive '${ARCHIVE_PATH}' does not exist." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load environment file if present (prefer .env.prod, fallback to .env)
if [ -f "${ROOT_DIR}/infra/prod/.env.prod" ]; then
  # shellcheck disable=SC1091
  set -a && source "${ROOT_DIR}/infra/prod/.env.prod" && set +a
elif [ -f "${ROOT_DIR}/.env.prod" ]; then
  # shellcheck disable=SC1091
  set -a && source "${ROOT_DIR}/.env.prod" && set +a
elif [ -f "${ROOT_DIR}/.env" ]; then
  # shellcheck disable=SC1091
  set -a && source "${ROOT_DIR}/.env" && set +a
fi

TMP_DIR="$(mktemp -d -t nivaran_restore_XXXXXX)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "==> [Restore] Extracting ${ARCHIVE_PATH}..."
tar -xzf "${ARCHIVE_PATH}" -C "${TMP_DIR}"

if [ ! -f "${TMP_DIR}/postgres.dump" ] || [ ! -f "${TMP_DIR}/mongo.archive" ]; then
  echo "Error: Archive is missing postgres.dump or mongo.archive." >&2
  exit 1
fi

# 1. Restore PostgreSQL
echo "--> Restoring PostgreSQL database..."
if docker ps --format '{{.Names}}' | grep -qi "postgres"; then
  PG_CONTAINER="$(docker ps --format '{{.Names}}' | grep -i "postgres" | head -n 1)"
  docker exec -i "${PG_CONTAINER}" pg_restore -U nivaran_owner -d nivaran --clean --if-exists --no-owner --no-privileges < "${TMP_DIR}/postgres.dump" || true
elif command -v pg_restore >/dev/null 2>&1 && [ -n "${POSTGRES_OWNER_URL:-}" ]; then
  pg_restore --clean --if-exists --no-owner --no-privileges -d "${POSTGRES_OWNER_URL}" "${TMP_DIR}/postgres.dump" || true
else
  echo "Error: Neither running postgres container nor pg_restore CLI found." >&2
  exit 1
fi
echo "--> PostgreSQL restore completed"

# 2. Restore MongoDB
echo "--> Restoring MongoDB replica set..."
if docker ps --format '{{.Names}}' | grep -qi "mongo"; then
  MONGO_CONTAINER="$(docker ps --format '{{.Names}}' | grep -i "mongo" | head -n 1)"
  docker exec -i "${MONGO_CONTAINER}" mongorestore --archive --gzip --drop < "${TMP_DIR}/mongo.archive"
elif command -v mongorestore >/dev/null 2>&1 && [ -n "${MONGO_URI:-}" ]; then
  mongorestore --uri="${MONGO_URI}" --archive="${TMP_DIR}/mongo.archive" --gzip --drop
else
  echo "Error: Neither running mongo container nor mongodump CLI found." >&2
  exit 1
fi
echo "--> MongoDB restore completed"

echo "==> [Restore] Database restore completed successfully from ${ARCHIVE_PATH}"
