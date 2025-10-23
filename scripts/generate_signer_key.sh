#!/usr/bin/env bash
# Generate a new 32-byte hex private key for use as an Ethereum signer
# Usage: ./scripts/generate_signer_key.sh
set -euo pipefail
if command -v openssl >/dev/null 2>&1; then
  key=$(openssl rand -hex 32)
else
  # fallback to /dev/urandom
  key=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
fi
echo "New private key (hex): $key"
echo
echo "IMPORTANT: store this securely. Do NOT commit to source control."
