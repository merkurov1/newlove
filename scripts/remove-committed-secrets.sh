#!/usr/bin/env bash
# Script: helper to find likely secrets and show commands to remove them from git history.
# WARNING: This script does NOT change history by default. Use with care and follow the steps below.

set -euo pipefail

echo "Scanning repo for likely secrets (simple heuristics)..."
echo

# look for common env names and long base64-like tokens
git grep -n "SUPABASE_SERVICE_ROLE_KEY\|NEXT_PUBLIC_SUPABASE_ANON_KEY\|RESEND_API_KEY\|ADMIN_API_SECRET" || true

echo
echo "If you find secrets, recommended steps (manual):"
echo " 1) Remove secret from files and commit the change."
echo " 2) Add the secret to your host (Vercel/GH Actions) secrets and update workflows."
echo " 3) If secret was committed earlier and needs to be purged from history, use the BFG or git filter-repo tools. Example (do not run without confirmation):"
echo
echo "   # Example using git filter-repo (install separately):"
echo "   git filter-repo --invert-paths --paths path/to/file/with/secret --force"
echo
echo "   # Or using BFG to remove a secret string (replace 'MY_SECRET')"
echo "   bfg --replace-text <(echo 'MY_SECRET==>[REDACTED]') --no-blob-protection"
echo
echo "4) Rotate the secret in the external service (Supabase/Resend) immediately."
