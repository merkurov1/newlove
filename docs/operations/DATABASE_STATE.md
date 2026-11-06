# Database state verification

This repository uses Supabase as the canonical data source, but repository SQL is not proof of production state. Some SQL files are explicitly proposed/manual-review files, and `sql/` contains historical setup scripts outside the dated migration directory. Never apply a file from this document automatically to production.

## Expected ownership model

- Browser clients use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` only.
- Server-side privileged operations use `SUPABASE_SERVICE_ROLE_KEY` and must remain behind application authorization.
- Public data should be exposed through explicit grants and RLS policies.
- Owner/admin and queue tables should be inaccessible to `anon` and ordinary `authenticated` clients.
- Security-definer functions must have a fixed `search_path`, narrow execute grants and an explicit authorization check where they are externally callable.
- Private storage buckets must not be read through `getPublicUrl`; application code should use signed URLs or server-side downloads.

## Read-only production verification

Use the Supabase SQL editor or a read-only database connection. Do not run `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `GRANT`, `REVOKE` or `APPLY MIGRATION` during verification.

1. Record the project ref, database version and current UTC time.
2. Export the applied migration history from the Supabase dashboard/CLI and compare it with the filenames in `migrations/`. Record missing, extra and out-of-order files.
3. Inventory exposed tables, views, policies and grants:

```sql
select table_schema, table_name, row_security
from information_schema.tables
where table_schema in ('public', 'storage')
order by table_schema, table_name;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_schema, table_name, grantee, privilege_type;
```

4. Verify sensitive tables have RLS and no ordinary grants. At minimum inspect `pierrot_*`, `knowledge_*`, `brain_*`, `worker_locks`, `ops_runtime_settings`, `wallet_auth_nonces`, `subscriber_tokens`, `orders`, `sessions`, `accounts`, `verificationtokens`, `whispers` and newsletter job/log tables.
5. Verify storage buckets:

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;
```

The `whispers` bucket is expected to be private after deployment of the stabilization code and the existing storage hardening migration. Confirm that no `anon` INSERT/SELECT policy remains for that bucket.

6. Inventory functions and execute grants. Pay special attention to `SECURITY DEFINER`, public-schema functions and functions named by worker/RAG/memory migrations:

```sql
select n.nspname as schema_name,
       p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'extensions')
order by n.nspname, p.proname;
```

7. Check indexes and queue growth for tables used by worker claims, conversations, memory retrieval, Brain chunks/embeddings and Flow distribution state. Capture counts and oldest pending item; do not mutate queues.
8. Compare the result against the SQL under `migrations/` and record the exact deployment delta in the release ticket or an operator note.

## Recovery and rollback

- Do not roll back a security migration by deleting objects. Use the matching file under `migrations/rollback/` only after confirming application compatibility and obtaining production approval.
- If the whisper deployment fails, keep the old bucket policy until the server upload path is confirmed. If the private policy has already been applied and the application is not ready, restore application service first; do not make the bucket public as an untracked emergency workaround.
- If a worker misbehaves, use `OPS_KILL_SWITCH`/worker-scope controls and stop its scheduler invocation. Do not add a replacement recurring job.
