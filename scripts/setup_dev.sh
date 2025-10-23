#!/usr/bin/env bash
set -euo pipefail

echo "Checking Node and npm versions..."
node -v || true
npm -v || true

if [ "$(node -v 2>/dev/null | sed 's/v//g' | cut -d. -f1)" -lt 22 ]; then
  echo "Node < 22 detected. Please install Node 22+ (use nvm install 22)"
  exit 1
fi

echo "Running npm ci..."
if ! npm ci; then
  echo "npm ci failed — trying pnpm as an alternative (will install pnpm locally)..."
  if ! command -v pnpm >/dev/null 2>&1; then
    npm i -g pnpm
  fi
  pnpm install
fi

echo "Dependencies installed. Run 'npm run dev' or 'npm run build' as needed."
