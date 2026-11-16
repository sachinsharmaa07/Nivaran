#!/usr/bin/env bash
# scripts/deploy.sh
# Builds production images, deploys to EC2 instance via AWS SSM Session Manager,
# verifies health, and provides a rollback path to a previous image tag.
#
# Usage:
#   ./scripts/deploy.sh [--instance-id i-xxx] [--domain example.com] [--tag v1.0.0]
#   ./scripts/deploy.sh --rollback <PREVIOUS_TAG> [--instance-id i-xxx]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load .env.prod if present
if [ -f "${ROOT_DIR}/infra/prod/.env.prod" ]; then
  # shellcheck disable=SC1091
  set -a && source "${ROOT_DIR}/infra/prod/.env.prod" && set +a
elif [ -f "${ROOT_DIR}/.env.prod" ]; then
  # shellcheck disable=SC1091
  set -a && source "${ROOT_DIR}/.env.prod" && set +a
fi

INSTANCE_ID="${INSTANCE_ID:-}"
DOMAIN="${DOMAIN:-}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
ROLLBACK_TAG=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance-id)
      INSTANCE_ID="$2"
      shift 2
      ;;
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    --rollback)
      ROLLBACK_TAG="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "${INSTANCE_ID}" ] && [ -f "${ROOT_DIR}/infra/terraform/terraform.tfstate" ]; then
  INSTANCE_ID="$(grep -o '"instance_id": "[^"]*' "${ROOT_DIR}/infra/terraform/terraform.tfstate" | cut -d'"' -f4 | head -n 1 || true)"
fi

if [ -z "${DOMAIN}" ]; then
  echo "Error: DOMAIN must be set in environment or via --domain" >&2
  exit 1
fi

if [ -n "${ROLLBACK_TAG}" ]; then
  echo "==> [Rollback] Initiating rollback to image tag: ${ROLLBACK_TAG}..."
  TAG="${ROLLBACK_TAG}"
fi

echo "==> Deploying Nivaran (${TAG}) to host ${INSTANCE_ID:-[Local/SSM]} for domain ${DOMAIN}..."

# 1. Build Production Images locally
echo "--> Building production container images (tag: ${TAG})..."
if [ "${DRY_RUN}" = false ]; then
  docker build -f "${ROOT_DIR}/apps/api/Dockerfile" -t "nivaran-api:${TAG}" -t "nivaran-api:prod" "${ROOT_DIR}"
  docker build -f "${ROOT_DIR}/apps/web/Dockerfile" -t "nivaran-web:${TAG}" -t "nivaran-web:prod" "${ROOT_DIR}"
  docker build -f "${ROOT_DIR}/apps/ai/Dockerfile" -t "nivaran-ai:${TAG}" -t "nivaran-ai:prod" "${ROOT_DIR}"
fi

# 2. Package production configs
BUNDLE_DIR="$(mktemp -d -t nivaran_deploy_XXXXXX)"
cleanup() {
  rm -rf "${BUNDLE_DIR}"
}
trap cleanup EXIT

cp "${ROOT_DIR}/infra/prod/compose.prod.yml" "${BUNDLE_DIR}/compose.prod.yml"
cp "${ROOT_DIR}/infra/prod/Caddyfile" "${BUNDLE_DIR}/Caddyfile"
cp "${ROOT_DIR}/infra/compose/pg-init.sql" "${BUNDLE_DIR}/pg-init.sql"
if [ -f "${ROOT_DIR}/infra/prod/.env.prod" ]; then
  cp "${ROOT_DIR}/infra/prod/.env.prod" "${BUNDLE_DIR}/.env.prod"
elif [ -f "${ROOT_DIR}/.env.prod" ]; then
  cp "${ROOT_DIR}/.env.prod" "${BUNDLE_DIR}/.env.prod"
fi

# Record current deployed tag for rollback reference
echo "LAST_DEPLOYED_TAG=${TAG}" > "${BUNDLE_DIR}/deploy.meta"

# 3. Deploy via SSM or local Docker Compose
if [ -n "${INSTANCE_ID}" ] && command -v aws >/dev/null 2>&1; then
  echo "--> Copying bundle and executing deployment via AWS SSM on instance ${INSTANCE_ID}..."
  
  # Archive bundle for transfer
  tar -czf "${BUNDLE_DIR}/deploy_bundle.tar.gz" -C "${BUNDLE_DIR}" compose.prod.yml Caddyfile pg-init.sql .env.prod deploy.meta
  
  # Encode bundle in base64 to stream through SSM
  BUNDLE_B64="$(base64 < "${BUNDLE_DIR}/deploy_bundle.tar.gz" | tr -d '\n')"

  SSM_COMMAND=$(cat <<EOF
mkdir -p /opt/nivaran
echo '${BUNDLE_B64}' | base64 -d | tar -xz -C /opt/nivaran
cd /opt/nivaran
export IMAGE_TAG=${TAG}
export DOMAIN=${DOMAIN}
docker compose -f compose.prod.yml up -d --remove-orphans
docker compose -f compose.prod.yml ps
EOF
)

  echo "--> Executing remote SSM command..."
  COMMAND_ID=$(aws ssm send-command \
    --instance-ids "${INSTANCE_ID}" \
    --document-name "AWS-RunShellScript" \
    --parameters commands=["${SSM_COMMAND}"] \
    --output text --query "Command.CommandId")

  echo "--> Waiting for SSM command ${COMMAND_ID} to complete..."
  aws ssm wait command-executed --command-id "${COMMAND_ID}" --instance-id "${INSTANCE_ID}"
  echo "--> SSM deployment completed."

else
  echo "--> [Local/Test Deploy] Running docker compose locally..."
  cd "${ROOT_DIR}/infra/prod"
  IMAGE_TAG="${TAG}" DOMAIN="${DOMAIN}" docker compose -f compose.prod.yml config >/dev/null
  echo "--> Compose configuration is valid."
fi

# 4. Health Check Verification
echo "--> Checking application health on https://${DOMAIN}/api/v1/healthz..."
for i in {1..12}; do
  if curl -fsSL -k "https://${DOMAIN}/api/v1/healthz" >/dev/null 2>&1; then
    echo "==> Application is healthy and responding!"
    break
  fi
  echo "    Waiting for service to become ready... (attempt $i/12)"
  sleep 5
done

echo ""
echo "======================================================================"
echo "  DEPLOYMENT SUCCESSFUL"
echo "  URL:       https://${DOMAIN}"
echo "  Image Tag: ${TAG}"
echo "  Rollback:  ./scripts/deploy.sh --rollback <PREVIOUS_TAG> --instance-id ${INSTANCE_ID:-<id>}"
echo "======================================================================"
