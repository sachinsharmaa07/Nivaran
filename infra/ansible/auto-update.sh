#!/usr/bin/env bash
# CivicPulse 12-Hour Container Image Auto-Update Script
# Runs every 12 hours via cron on the CivicPulse EC2 application server

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/civicpulse}"
LOG_FILE="${LOG_FILE:-/var/log/nivaran-autoupdate.log}"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*" | tee -a "$LOG_FILE"
}

log "=== Starting 12-hour container auto-update cycle ==="

if [ ! -d "$APP_DIR" ]; then
  log "ERROR: Application directory $APP_DIR does not exist. Aborting."
  exit 1
fi

cd "$APP_DIR"

if [ ! -f "compose.prod.yml" ]; then
  log "ERROR: compose.prod.yml not found in $APP_DIR. Aborting."
  exit 1
fi

# Step 1: Pull latest images from Docker Hub
log "Pulling latest images from registry..."
if ! docker compose -f compose.prod.yml pull >> "$LOG_FILE" 2>&1; then
  log "WARNING: Docker pull encountered errors. Keeping currently running containers active."
  exit 1
fi

# Step 2: Recreate containers (volumes are preserved, no data loss)
log "Recreating containers with new images..."
if ! docker compose -f compose.prod.yml up -d --remove-orphans >> "$LOG_FILE" 2>&1; then
  log "ERROR: docker compose up failed! Check container logs."
  exit 1
fi

# Step 3: Test readiness endpoint
log "Verifying application readiness (/readyz)..."
READY=0
for i in $(seq 1 15); do
  if curl -sf --max-time 5 "http://127.0.0.1:80/readyz" > /dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 3
done

if [ "$READY" -eq 1 ]; then
  log "Readiness probe passed: /readyz returned 200 OK."
else
  log "WARNING: Readiness probe did not return 200 within timeout."
fi

# Step 4: Prune dangling images to conserve disk space (leaves tagged & in-use images intact)
log "Pruning dangling images..."
docker image prune -f >> "$LOG_FILE" 2>&1 || true

log "=== 12-hour container auto-update cycle finished successfully ==="
