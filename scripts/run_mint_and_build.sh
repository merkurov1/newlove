#!/usr/bin/env bash
set -euo pipefail

# Source local env (do not print)
if [ -f .env.deploy.local ]; then
  set -a
  # shellcheck disable=SC1091
  . .env.deploy.local
  set +a
else
  echo ".env.deploy.local not found" >&2
  exit 2
fi

# Ensure key is present
if [ -z "${DEPLOY_PRIVATE_KEY:-}" ]; then
  echo "DEPLOY_PRIVATE_KEY not set in .env.deploy.local" >&2
  exit 3
fi

# Compute deployer address using the helper (which will not print the key)
DEPL_ADDR=$(node ./scripts/get_deployer_address.js)
if [ -z "$DEPL_ADDR" ]; then
  echo "Failed to compute deployer address" >&2
  exit 4
fi
export TARGET_ADDRESS="$DEPL_ADDR"
echo "Deployer address: $TARGET_ADDRESS"

# Ensure contract address is set
if [ -z "${NEUTRAL_HEART_ADDRESS:-}" ]; then
  echo "NEUTRAL_HEART_ADDRESS not set. Set it and re-run." >&2
  exit 5
fi

echo "Minting via scripts/mint_and_transfer.js (this will create on-chain txs)..."
npx hardhat run --network polygon scripts/mint_and_transfer.js 2>&1 | tee /tmp/mint_and_transfer.log

if grep -q "Mint tx:" /tmp/mint_and_transfer.log || grep -q "transactionHash" /tmp/mint_and_transfer.log; then
  echo "Mint appears successful. Building Next.js app..."
  npm run build 2>&1 | tee /tmp/next_build.log
  echo "Build finished. Tail of build log:"
  tail -n 160 /tmp/next_build.log
else
  echo "Mint did not succeed; see /tmp/mint_and_transfer.log" >&2
  tail -n 160 /tmp/mint_and_transfer.log
  exit 6
fi
