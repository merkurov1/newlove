# Supabase validation checklist

This file lists the minimal schema, env variables and quick checks you can run to validate your Supabase setup for this project.

Important: do not paste secret keys into public places. Use `.env` for local runs and CI secrets for CI.

## Required environment variables

- NEXT_PUBLIC_SUPABASE_URL — your Supabase project URL (https://<project>.supabase.co)
- SUPABASE_SERVICE_ROLE_KEY — service_role key (server-side secret; must be service_role for administrative operations)
- NEXT_PUBLIC_SUPABASE_ANON_KEY — optional for client-side local dev
- RESEND_API_KEY — for sending emails via Resend (optional for dry-run)
- ADMIN_API_SECRET — optional admin secret used by server actions

Local `.env` example (do NOT commit real secrets):

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>"
RESEND_API_KEY=re_xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=pk.xxxx
ADMIN_API_SECRET=your-admin-secret

## Expected tables & columns (quick reference)

These SQL migrations are already included in the repo (`recreate_articles_table.sql`, `migrate_letters_fix.sql`, etc.). The app assumes the following tables/columns exist:

- Tag
  - id (text)
  - name (text, unique)
  - slug (text, unique)
  - createdAt, updatedAt

- articles (or article)
  - id (text)
  - title, slug, content, published, publishedAt, authorId
  - unique index on slug

- _ArticleToTag, _ProjectToTag, _LetterToTag (junction tables)
  - A (text) — foreign key to article/project/letter id
  - B (text) — foreign key to Tag.id
  - unique index on (A,B)

- subscribers
  - id (text), email (text), userId (text nullable), isActive (boolean)

- subscriber_tokens
  - id (text optional), subscriber_id (text foreign key to subscribers.id), type (confirm|unsubscribe), token (text), used (boolean)

## Quick REST checks (useful to run from CI or locally)

1) Verify basic connectivity (do NOT echo secrets):

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://<your>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"

# Try list tables via REST (requires correct key)
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/Tag?select=id,name&limit=1" | jq .
```

Expected: JSON array (possibly empty). If you get `permission denied for schema public` then:

- Check that the KEY is the project `service_role` key (Dashboard -> Settings -> API -> Service key)
- Check that the URL matches the project that the key belongs to
- If the key is from a different project you will see permission errors

2) Verify subscribers table exists:

```bash
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/subscribers?select=id,email&limit=1" | jq .
```

3) If REST gives permission denied but you can log in to the dashboard, try a psql connection with DATABASE_URL (if available) to inspect schema.

## How to fix "permission denied for schema public"

- Make sure `SUPABASE_SERVICE_ROLE_KEY` is the service_role key for the same project as `NEXT_PUBLIC_SUPABASE_URL`.
- If you're using a managed environment (CI), ensure the secret is not scoped or rotated.
- If your database uses Row Level Security (RLS), service_role should bypass RLS. Permission denied usually indicates the key is invalid or for another project.
- If the database user associated with the key has restricted privileges, regenerate the service key in Supabase dashboard.

## Running the local test script (tags)

This repo contains `scripts/test-tags.js` which performs a minimal upsert of tags and links to `_ArticleToTag`.

Run locally (with `.env` present or export env vars):

```bash
# load .env automatically (dotenv is available)
node -r dotenv/config ./scripts/test-tags.js

# or explicit
NEXT_PUBLIC_SUPABASE_URL="https://<your>.supabase.co" SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" node ./scripts/test-tags.js
```

If it completes without errors, tags and junction rows were created.

## When to escalate

If you continue to get `permission denied` after verifying the service_role key and URL are correct:

- Open the Supabase project dashboard -> Settings -> API and re-copy the `service_role` key.
- Check project membership and confirm you are using the correct project.
- If you cannot resolve it, run the following (safely) and send the non-secret parts of the output to the integrator:

```bash
# DO NOT SHARE SECRET VALUES
echo "URL set?"; [ -n "$NEXT_PUBLIC_SUPABASE_URL" ] && echo yes || echo no
echo "SERVICE_KEY set?"; [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && echo yes || echo no
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/Tag?select=id&limit=1" -i
```

This prints HTTP response headers without revealing the key.

## Next steps (after validation)

1. Run `node -r dotenv/config ./scripts/test-tags.js` to exercise tag upsert
2. If successful, consider running full site locally:

```bash
npm run dev
```

3. Run linters/tests and fix issues:

```bash
npx tsc --noEmit
npm run lint
```

If you want, I can now:
- Re-run the `scripts/test-tags.js` here (requires valid .env in the container), or
- Start fixing ESLint errors incrementally (I recommend fixing high-priority runtime/React Hook errors first).

