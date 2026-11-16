#!/usr/bin/env bash
# scripts/backup.sh
# Performs consistent pg_dump (PostgreSQL) and mongodump (MongoDB) archives.
# Stores locally in timestamped archive and optionally uploads to AWS S3.
#
# Cron example (Daily at 02:00 AM UTC):
# 0 2 * * * /opt/nivaran/scripts/backup.sh >> /var/log/nivaran-backup.log 2>&1
#
# Systemd Timer example:
# /etc/systemd/system/nivaran-backup.service:
#   [Service]
#   Type=oneshot
#   ExecStart=/opt/nivaran/scripts/backup.sh
# /etc/systemd/system/nivaran-backup.timer:
#   [Timer]
#   OnCalendar=*-*-* 02:00:00
#   Persistent=true
#   [Install]
#   WantedBy=timers.target

set -euo pipefail

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

BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date -u +"%Y%m%d_%H%M%S")"
TMP_DIR="$(mktemp -d -t nivaran_backup_XXXXXX)"
ARCHIVE_NAME="nivaran_backup_${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "==> [Backup] Starting Nivaran backup at ${TIMESTAMP}..."

# 1. PostgreSQL dump (Custom format -Fc)
echo "--> Dumping PostgreSQL database..."
if docker ps --format '{{.Names}}' | grep -qi "postgres"; then
  PG_CONTAINER="$(docker ps --format '{{.Names}}' | grep -i "postgres" | head -n 1)"
  docker exec "${PG_CONTAINER}" pg_dump -U nivaran_owner -d nivaran -Fc > "${TMP_DIR}/postgres.dump"
elif command -v pg_dump >/dev/null 2>&1 && [ -n "${POSTGRES_OWNER_URL:-}" ]; then
  pg_dump "${POSTGRES_OWNER_URL}" -Fc -f "${TMP_DIR}/postgres.dump"
else
  echo "Error: Neither running postgres container nor pg_dump CLI found." >&2
  exit 1
fi

# 2. MongoDB dump (BSON archive format)
echo "--> Dumping MongoDB replica set..."
if docker ps --format '{{.Names}}' | grep -qi "mongo"; then
  MONGO_CONTAINER="$(docker ps --format '{{.Names}}' | grep -i "mongo" | head -n 1)"
  docker exec "${MONGO_CONTAINER}" mongodump --archive --gzip > "${TMP_DIR}/mongo.archive"
elif command -v mongodump >/dev/null 2>&1 && [ -n "${MONGO_URI:-}" ]; then
  mongodump --uri="${MONGO_URI}" --archive="${TMP_DIR}/mongo.archive" --gzip
else
  echo "Error: Neither running mongo container nor mongodump CLI found." >&2
  exit 1
fi

# 3. Write metadata manifest
cat <<EOF > "${TMP_DIR}/metadata.json"
{
  "timestamp": "${TIMESTAMP}",
  "date_utc": "$(date -u -Iseconds)",
  "version": "1.0.0",
  "project": "nivaran",
  "files": [
    "postgres.dump",
    "mongo.archive"
  ]
}
EOF

# 4. Package into timestamped archive
echo "--> Compressing archive to ${ARCHIVE_PATH}..."
tar -czf "${ARCHIVE_PATH}" -C "${TMP_DIR}" postgres.dump mongo.archive metadata.json
ARCHIVE_SIZE="$(du -h "${ARCHIVE_PATH}" | cut -f1)"
echo "==> Backup complete: ${ARCHIVE_PATH} (${ARCHIVE_SIZE})"

# 5. Optional S3 Upload
if [ -n "${S3_BUCKET:-}" ] && command -v aws >/dev/null 2>&1; then
  echo "--> Uploading backup to s3://${S3_BUCKET}/backups/${ARCHIVE_NAME}..."
  aws s3 cp "${ARCHIVE_PATH}" "s3://${S3_BUCKET}/backups/${ARCHIVE_NAME}"
  echo "==> Successfully uploaded to S3"
fi
