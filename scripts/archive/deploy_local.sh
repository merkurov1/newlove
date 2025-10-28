#!/usr/bin/env bash
set -euo pipefail

# Safe local deploy helper
# Usage: copy .env.deploy.local to your machine, then run:
#   bash deploy_local.sh
# Requires: Node 22+, npm, git

# 1) ensure env file
if [ ! -f .env.deploy.local ]; then
  echo "Please create .env.deploy.local in this folder with DEPLOY_PRIVATE_KEY, POLYGON_RPC_URL, NEUTRAL_HEART_BASEURI, POLYGONSCAN_API_KEY"
  exit 1
fi

# 2) install deps
echo "Installing dependencies (this may take a few minutes)..."
npm ci

# 3) compile
echo "Compiling contracts..."
npx hardhat compile

# 4) deploy
set -a; . ./.env.deploy.local; set +a
echo "Deploying to network: $POLYGON_RPC_URL"
npx hardhat run --network polygon scripts/deploy_hardhat.js

echo "Done. If verification was enabled, check Polygonscan."
