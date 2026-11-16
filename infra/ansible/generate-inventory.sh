#!/usr/bin/env bash
# Generate Ansible inventory.ini for CivicPulse
# Usage:
#   ./generate-inventory.sh <APP_IP> [SSH_KEY_PATH]
#   ./generate-inventory.sh --from-terraform [TF_DIR] [SSH_KEY_PATH]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_FILE="${SCRIPT_DIR}/inventory.ini"
DEFAULT_KEY="~/.ssh/aws.pem"

if [ "${1:-}" = "--from-terraform" ]; then
  TF_DIR="${2:-${SCRIPT_DIR}/../terraform}"
  KEY_PATH="${3:-$DEFAULT_KEY}"
  if ! command -v terraform &> /dev/null; then
    echo "ERROR: terraform command not found in PATH." >&2
    exit 1
  fi
  echo "Reading private_ip from Terraform output in $TF_DIR..."
  APP_IP=$(terraform -chdir="$TF_DIR" output -raw private_ip 2>/dev/null || true)
  if [ -z "$APP_IP" ]; then
    echo "ERROR: Failed to read private_ip from Terraform. Is 'terraform apply' completed?" >&2
    exit 1
  fi
elif [ -n "${1:-}" ]; then
  APP_IP="$1"
  KEY_PATH="${2:-$DEFAULT_KEY}"
else
  echo "Usage:"
  echo "  $0 <APP_IP> [SSH_KEY_PATH]"
  echo "  $0 --from-terraform [TF_DIR] [SSH_KEY_PATH]"
  exit 1
fi

cat <<EOF > "$TARGET_FILE"
# CivicPulse Ansible Inventory (Generated on $(date -u +'%Y-%m-%dT%H:%M:%SZ'))
[app]
civicpulse-app ansible_host=${APP_IP} ansible_user=ubuntu ansible_ssh_private_key_file=${KEY_PATH} ansible_ssh_common_args='-o StrictHostKeyChecking=no'

[app:vars]
ansible_python_interpreter=/usr/bin/python3
EOF

echo "Generated inventory at: $TARGET_FILE"
echo "Target host: $APP_IP (User: ubuntu, Key: $KEY_PATH)"
