#!/usr/bin/env bash
# scripts/collect_diagnostics.sh
# Collect diffs, important file diffs, metadata checks and Supabase access test into a single diagnostics file.
# Usage: ./scripts/collect_diagnostics.sh [output-file]
# WARNING: output may contain sensitive data (IDs, API responses). Review before sharing.

set -euo pipefail
OUT=${1:-diagnostics.txt}
OLD_COMMIT=${OLD_COMMIT:-59c1849f560f8a6106a6743d3243b0c3cfd2fd19}

echo "Diagnostics run at: $(date --utc +"%Y-%m-%dT%H:%M:%SZ")" > "$OUT"
echo "cwd: $(pwd)" >> "$OUT"
echo "git HEAD: $(git rev-parse --verify HEAD 2>/dev/null || echo 'no-git')" >> "$OUT"

# Fetch remotes (best-effort)
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "\n-- git fetch --all --quiet --" >> "$OUT"
  git fetch --all --quiet 2>> "$OUT" || true
else
  echo "\n-- Not a git repo / cannot run git commands --" >> "$OUT"
fi

# Check if the old commit exists
if git rev-parse --verify "$OLD_COMMIT" >/dev/null 2>&1; then
  echo "\n-- git diff --name-status $OLD_COMMIT..HEAD --" >> "$OUT"
  git diff --name-status "$OLD_COMMIT"..HEAD >> "$OUT" 2>&1 || true

  echo "\n-- git diff for key files --" >> "$OUT"
  git diff "$OLD_COMMIT"..HEAD -- lib/attachTagsToArticles.js lib/supabase-server.js lib/serverAuth.ts lib/getSupabaseForRequest.js lib/metadataSanitize.ts app/[slug]/page.js app/tags/[slug]/page.js app/you/[username]/page.js app/digest/[slug]/page.js >> "$OUT" 2>&1 || true

  echo "\n-- git show $OLD_COMMIT --name-only --" >> "$OUT"
  git show "$OLD_COMMIT" --name-only >> "$OUT" 2>&1 || true
else
  echo "\n-- Old commit $OLD_COMMIT not found locally. Skipping git diffs vs that commit. --" >> "$OUT"
fi

# Recent git log
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "\n-- git log --oneline -n 50 --" >> "$OUT"
  git log --oneline -n 50 >> "$OUT" 2>&1 || true
fi

# Run metadata finder script if present
if [ -f scripts/find_bad_metadata.js ]; then
  echo "\n-- node scripts/find_bad_metadata.js output --" >> "$OUT"
  node scripts/find_bad_metadata.js >> "$OUT" 2>&1 || true
else
  echo "\n-- scripts/find_bad_metadata.js not found --" >> "$OUT"
fi

# Supabase service_role test (will not echo the key in the logs, but will show the response)
echo "\n-- Supabase service_role test --" >> "$OUT"
if [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Testing REST read of _ArticleToTag (select A,B limit 1) against $NEXT_PUBLIC_SUPABASE_URL" >> "$OUT"
  # Use curl but avoid printing the Authorization header value into the output.
  curl -s \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/_ArticleToTag?select=A,B&limit=1" >> "$OUT" 2>&1 || true
else
  echo "Skipping Supabase test: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in env." >> "$OUT"
fi

# Optional: collect Vercel logs if vercel CLI available and VERCEL_DEPLOYMENT or VERCEL_PROJECT provided
if command -v vercel >/dev/null 2>&1 && [ -n "${VERCEL_DEPLOYMENT:-}" ]; then
  echo "\n-- vercel logs $VERCEL_DEPLOYMENT --since 1h --output=raw --" >> "$OUT"
  vercel logs "$VERCEL_DEPLOYMENT" --since 1h --output=raw >> "$OUT" 2>&1 || true
elif command -v vercel >/dev/null 2>&1 && [ -n "${VERCEL_PROJECT:-}" ]; then
  echo "\n-- vercel logs for project $VERCEL_PROJECT (since 1h) --" >> "$OUT"
  vercel logs "$VERCEL_PROJECT" --since 1h --output=raw >> "$OUT" 2>&1 || true
else
  echo "\n-- vercel CLI not available or no VERCEL_DEPLOYMENT/VERCEL_PROJECT provided. Skipping Vercel logs. --" >> "$OUT"
fi

# Grep for our known error markers inside the generated file
echo "\n-- quick grep of generated output for known markers --" >> "$OUT"
rg "SANITIZE DIAG|Unsupported Server Component|attachTagsToArticles|permission denied|2153716801" "$OUT" -n --no-ignore 2>> "$OUT" || true

# Finish
echo "\nDiagnostics collected to: $(realpath "$OUT")" >> "$OUT"

echo "Diagnostics written to: $OUT"
exit 0
