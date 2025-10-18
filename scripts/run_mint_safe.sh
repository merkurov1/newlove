#!/usr/bin/env bash
set -euo pipefail

# Change to repo root
cd "$(dirname "$0")/.."

# Load local env file if present
if [ -f .env.deploy.local ]; then
  set -a
  # shellcheck disable=SC1091
  . .env.deploy.local
  set +a
else
  echo ".env.deploy.local not found" >&2
  exit 1
fi

# Normalize key from file (trim whitespace)
KEY=$(grep -m1 '^DEPLOY_PRIVATE_KEY=' .env.deploy.local || true)
if [ -z "$KEY" ]; then
  echo "DEPLOY_PRIVATE_KEY not found in .env.deploy.local" >&2
  exit 2
fi
KEY=$(echo "$KEY" | cut -d= -f2- | tr -d '\r\n[:space:]')
if [ -z "$KEY" ]; then
  echo "DEPLOY_PRIVATE_KEY is empty after trimming" >&2
  exit 3
fi

# Compute deployer address safely using helper script
DEPL_ADDR=$(node ./scripts/get_deployer_address.js 2>/dev/null || true)
if [ -z "$DEPL_ADDR" ]; then
  echo "Failed to compute deployer address (get_deployer_address.js)" >&2
  exit 4
fi

echo "Deployer address: $DEPL_ADDR"

# Ensure contract address present
if [ -z "${NEUTRAL_HEART_ADDRESS:-}" ]; then
  echo "NEUTRAL_HEART_ADDRESS must be set in env or exported before running" >&2
  exit 5
fi

# Ensure RPC set (use public fallback if absent)
POLYGON_RPC_URL=${POLYGON_RPC_URL:-"https://polygon-rpc.com/"}
export POLYGON_RPC_URL

export TARGET_ADDRESS="$DEPL_ADDR"

echo "Running mint_unified.js (this will broadcast on-chain txs)."

# Run mint with DEPLOY_PRIVATE_KEY provided inline to the process (not printed)
DEPLOY_PRIVATE_KEY="$KEY" node ./scripts/mint_unified.js --mode ethers
