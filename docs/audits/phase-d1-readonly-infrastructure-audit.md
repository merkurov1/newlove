# Phase D.1 — Read-Only Infrastructure Audit

**Status:** Audit complete. No implementation, migration, ingestion, package installation, model download, API call, database access, commit, push, deploy, or configuration change occurred.

**Current branch:** `phase-c4-multilingual-bakeoff`

**Working tree:** existing Phase B–C.4 documentation and `lib/knowledge/` work remain untracked and preserved. No reset, clean, stash, branch switch, or deletion was performed.

---

## 1. Current state

| Item | Verified state |
|---|---|
| Branch | `phase-c4-multilingual-bakeoff` |
| HEAD | `60205097fe790c8fadc8a6cd68608dc4044fd44a` |
| Manuscript | `app/unframed/Unframed.markdown` |
| Manuscript SHA-256 | `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923` |
| Public copy | `public/unframed/Unframed.markdown`, byte-identical |
| Manifest | `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2` |
| Local knowledge tests | 6 suites, 60 tests passed |
| Existing reports | Phase B, C, C.1, C.2, C.3, C.4, and Phase D blocker report preserved |

`git status` shows only untracked documentation and existing `lib/knowledge/` / `scripts/knowledge/` work. Nothing was changed by this audit.

---

## 2. Verified Pierrot architecture

### Request flow

`POST /api/pierrot-web` in `app/api/pierrot-web/route.ts`:

1. Runtime is Node.js, force-dynamic, `maxDuration = 60` (lines 41–43).
2. Rate limiting:
   - public web: 20 requests/minute per IP;
   - internal Telegram adapter: 60 requests/minute per Telegram user when `x-pierrot-internal` is valid.
   Limit implementation is `lib/rateLimit.ts`, an in-memory store with a five-minute cleanup interval.
3. Request body fields: `message`, `history`, `context`, `conversationId`, `sessionId`, `userMessageId`, `consent`.
4. Validation includes:
   - non-empty message;
   - `PIERROT_MAX_MESSAGE_LENGTH` (4,000);
   - identifier regex validation;
   - pathname/referrer sanitization;
   - history limits: 24 items, 16,000 characters total, 4,000 per item.
5. Admin state is derived server-side (lines 187–225):
   - `getCurrentUser()` → Supabase session → `users.role`;
   - `requireAdminFromRequest()` for Bearer JWT, Telegram initData, or `x-admin-secret`;
   - legacy `x-admin-key` comparison against `ADMIN_SECRET_KEY` or `PIERO_API_SECRET`.
   No request-body `isAdmin` is accepted.
6. Conversation persistence uses `lib/pierrot/serverStore.ts` and a service-role client:
   - `ensurePierrotConversation`
   - `appendPierrotMessage`
   - `recordPierrotEvent`
   - `conversationBelongsToSession`
   - `findPierrotAssistantReply`
   The service-role client bypasses RLS; session checks are enforced in code and RPCs.
7. The system prompt is assembled from `PIERROT_PROMPT_PUBLIC` or `PIERROT_PROMPT_OWNER`, page context, and commercial prompt (lines 358–363).
8. `plan.useModel` determines whether the request is handled deterministically or sent to DeepSeek (lines 443–447).
9. `callDeepSeek` uses the `openai` SDK against `https://api.deepseek.com` with `deepseek-chat` or `deepseek-reasoner` (lines 86–115, 489). The route returns a normal JSON response; it does not stream.
10. Assistant output is persisted and returned (lines 514–563).

### Safe future insertion point

A retrieval adapter can eventually be placed inside the existing `if (plan.useModel)` block, after replay handling and before `callDeepSeek`, without affecting deterministic commercial/service responses.

If RAG is disabled or unavailable, the route must use the existing prompt and provider path unchanged. No retrieval should run for `plan.useModel === false`.

### Existing authentication

`lib/serverAuth.ts` provides:

- `getCurrentUser()` — Supabase `auth.getUser()`, then `users.role`.
- `requireAdmin()` — verified role check.
- `requireAdminFromRequest()` — admin secret, Telegram initData, Bearer JWT, or cookie session.
- `x-admin-key` is not accepted by `requireAdminFromRequest`; it is a separate legacy check in `pierrot-web`.

`lib/supabase/server.ts` supports service-role clients with no persisted cookies; it never exposes the service-role key to the browser.

---

## 3. Credentials and provider configuration

### Evidenced locally

- The current process environment contains `DEEPSEEK_API_KEY`; it does not contain:
  - `SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_KEY`
  - `DATABASE_URL`
  - `OPENAI_API_KEY`
  - `VOYAGE_API_KEY`
  - `COHERE_API_KEY`
  - `PIERROT_RAG_ENABLED`
- `.env.example` documents Supabase variables and `DEEPSEEK_API_KEY`, but no embedding-provider key.
- `package.json` includes `openai` and `pg`, but no embedding SDK or vector client.
- `.env.local` was not printed. No Supabase or embedding credentials were available to the running process.

### Documented but unverified

- Supabase URL, anon key, and service-role key are documented in `.env.example`.
- Production Vercel environment variables may differ from this workspace.
- No evidence establishes that the live Supabase project has `vector` installed or that the configured service-role key has the expected privileges.

### Cannot verify without authorized access

- Live Supabase extension availability.
- Live schema, RLS policies, grants, RPCs, and PostgREST exposure.
- Production embedding provider configuration.
- Vercel function region, cold-start behavior, and plan limits.

**No service-role or direct database operation was attempted.**

---

## 4. Security findings

### Confirmed issues

1. **Forgeable manuscript cookies**
   - `app/api/unframed/content/route.ts` checks:
     - `unframed_access === 'true'`
     - `unframed_admin === 'true'`
   - `app/api/unframed/admin/route.ts` sets `unframed_admin` to a literal `true`.
   - `app/api/unframed/verify/route.ts` sets `unframed_access` to a literal `true`.
   - These are unsigned client-controlled values. They must never authorize owner-only RAG.

2. **Legacy `x-admin-key`**
   - `app/api/pierrot-web/route.ts` accepts `x-admin-key` if it matches `ADMIN_SECRET_KEY` or `PIERO_API_SECRET`.
   - This is a shared server secret, not a verified user session.
   - It should not grant owner-only RAG without a dedicated review.

3. **Public manuscript copy**
   - `public/unframed/Unframed.markdown` is a Next.js public asset.
   - `next.config.js` contains no header or rewrite blocking `/unframed/Unframed.markdown`.
   - The manuscript is structurally reachable as a static public file unless production CDN configuration blocks it.
   - The repository contains no evidence that public-use rights were confirmed.

4. **Broken local manuscript route**
   - `/api/unframed/content` reads `process.cwd()/content/Unframed.markdown`.
   - No `content/` directory exists in the repository.
   - The route is therefore broken in this checkout, although a production-only mount could exist.

5. **Admin-role source inconsistency**
   - `lib/serverAuth.ts` reads `users.role`.
   - `app/admin/actions.ts` updates `user_metadata.role` in some paths.
   - `app/api/admin/users/[id]/route.ts` updates `users.role`.
   - Live data and the authoritative admin field are unverified. Owner RAG must not rely on a stale or dual-written role field.

### Potential issues

- `getClientIp()` trusts the first `x-forwarded-for` value. Vercel normally sets this header, but direct access or misconfiguration should be considered.
- The rate limiter is process-local memory, not a distributed store. It does not provide a global limit across server instances.
- `middleware.ts` excludes `/api` from its matcher; API authentication is entirely handler-level. That is acceptable only if every protected handler verifies auth explicitly.

### Required controls for future owner-only RAG

- Use `getCurrentUser()` / `requireAdminFromRequest()` on every protected request.
- Reject all client-provided `isAdmin`, `scope`, `owner`, `documentId`, and role claims.
- Do not use `unframed_admin` or `unframed_access` cookies.
- Do not use legacy `x-admin-key` unless separately approved as a server-only service credential.
- Verify the authoritative admin role field before enabling owner retrieval.
- Enforce public/owner scope in the SQL query before text enters model context.

---

## 5. Supabase readiness

### Evidenced in repository

- No `vector` extension is declared in tracked `migrations/` or `sql/`.
- No vector columns, embedding tables, or similarity-search RPCs are present.
- No `knowledge` schema or `public.knowledge_*` tables exist in tracked migrations.
- Existing `public.pierrot_*` tables use a closed RLS pattern:
  - RLS enabled;
  - no anon/authenticated policies;
  - table and function access revoked from `PUBLIC`, `anon`, `authenticated`;
  - only `service_role` granted.
- Existing migrations use names such as `2026-10-29_create_pierrot_conversations.sql`.
- `items` uses a public-read policy for published/public rows plus service-role policies.
- Knowledge Map uses a storage bucket and RPCs that are not defined in tracked migrations; it is a separate graph capability.

### Missing / unverified

- Whether `vector` is installed in the live project.
- Whether the live project has `pg_trgm` or related extensions.
- Whether a custom `knowledge` schema is exposed through PostgREST.
- Live RLS policies, grants, function definitions and schema ACLs.
- Whether a direct database connection is configured.
- Whether the live project already contains conflicting knowledge tables.

### Proposed isolation

A dedicated `knowledge` schema with:

- tables not exposed through PostgREST;
- `REVOKE ALL` from `PUBLIC`, `anon`, `authenticated`;
- service-role-only `SECURITY DEFINER` RPCs;
- RLS enabled as defense-in-depth;
- no reuse of Knowledge Map graph tables or storage.

If Supabase API configuration cannot demonstrate that the custom schema is excluded, fall back to `public.knowledge_*` tables with the same closed RLS/grant pattern.

---

## 6. Provider comparison — decision remains pending

### Option A — OpenAI `text-embedding-3-small`

| Criterion | Assessment |
|---|---|
| Model ID | `text-embedding-3-small` |
| Default dimension | 1536 |
| Multilingual | Claimed, but must be validated on frozen C4 Russian questions |
| Runtime | External HTTPS API; Vercel-compatible |
| SDK | `openai` already installed |
| Credential | `OPENAI_API_KEY` absent; paid usage not authorized |
| Data handling | Chunk and query text would be sent to OpenAI |
| Cost | One-time 169-chunk indexing plus per-query embedding; current pricing must be confirmed |
| Reproducibility | Model + dimension must be pinned in document/chunk metadata |
| Generation | DeepSeek remains the answer-generation provider |

This is the smallest integration path in the current codebase, but it introduces a paid third-party dependency and sends manuscript content off-infrastructure. It must not be activated without explicit approval.

### Option B — Self-hosted multilingual embedding model

Candidates would need explicit naming, versioning and dimension, such as a multilingual E5/BGE-family model.

| Criterion | Assessment |
|---|---|
| Multilingual | Potentially strong, but unproven in this repository |
| Runtime | No local ONNX/Torch/sentence-transformers runtime installed |
| Vercel | Large model weights and inference are a poor fit for serverless request paths |
| Ingestion | Could run offline, but query-time embedding still needs a host/service |
| Data handling | Could keep manuscript in-house if hosted appropriately |
| Cost | Infrastructure and operations rather than per-token API cost |
| Reproducibility | Strong if model revision, tokenizer, pooling and prefixes are pinned |

This requires a separate runtime decision and possibly a dedicated service. It is not authorized or available today.

### Option C — Another provider

A provider such as Cohere or Voyage would require:

- a new account and key;
- a new dependency or direct HTTP integration;
- a data-processing review;
- a new model/dimension decision.

No repository evidence supports one today.

### Explicitly excluded

`all-MiniLM-L6-v2` is English-only and is **not acceptable** for the pure-Russian requirement.

### Recommendation

Provisionally, `text-embedding-3-small` is the smallest implementation path because the OpenAI SDK is already installed and it can run from Vercel. However, the owner must decide:

1. Whether manuscript chunks may be sent to a third-party embedding provider.
2. Whether paid embedding usage is authorized.
3. Whether 1536 dimensions are accepted.
4. Whether multilingual claims are validated by the frozen C4 Russian questions before rollout.

DeepSeek remains the generation model. No provider was called.

---

## 7. Proposed minimum architecture

For approximately 169 chunks:

- Source: `app/unframed/Unframed.markdown`, pinned by SHA-256.
- Parser/chunker: existing `unframed-parser-v1` / `unframed-chunker-v1`.
- One document row for UNFRAMED; 169 chunk rows.
- Embedding model and dimensions recorded on the document and ingestion run.
- Storage: isolated `knowledge` schema or closed `public.knowledge_*` tables.
- Access: server-only service-role RPC; public scope explicitly filtered in SQL.
- No owner-only RAG in the public Pierrot route in this phase.
- Retrieval returns at most 5 chunks, bounded by a calibrated threshold and an 8,000-character context budget.
- Statuses: `relevant_results`, `weak_match`, `no_match`, `unavailable`.
- Query timeout: 1.5 seconds; zero retries; no database writes during retrieval.
- Feature flag: `PIERROT_RAG_ENABLED=false`.
- If disabled or unavailable, the exact existing Pierrot prompt/provider path is used.
- Ingestion is an explicit script, never a build/page/request path, with a dry-run and idempotent chunk hashes.

### Indexing

For 169 chunks, a sequential scan is sufficient. Do **not** add HNSW or IVFFlat yet. Add an index only after measured latency or corpus growth justifies it.

### Answer behaviour

- Retrieved text is untrusted data, JSON-escaped and clearly delimited.
- The system prompt must instruct Pierrot to use only retrieved evidence for manuscript claims.
- If evidence is insufficient, Pierrot must say it cannot establish the answer from UNFRAMED.
- No page numbers, chapter references or quotations may be invented.
- Retrieval failure must not be described as “the manuscript has no answer.”

### Logging

Log only status, scope, chunk count, latency and error code. Never log queries, passages, embeddings, prompts, credentials or user records.

---

## 8. Read-only SQL audit

Live database access is unavailable in this workspace. The owner should run the following **read-only** queries manually in Supabase SQL Editor. They query metadata only and do not read manuscript/user content.

```sql
-- 1. Extensions
select extname, extversion
from pg_extension
where extname in ('vector', 'pg_trgm');

select name, default_version, installed_version
from pg_available_extensions
where name in ('vector', 'pg_trgm');

-- 2. Relevant schemas
select nspname, nspacl
from pg_namespace
where nspname in ('public', 'knowledge');

-- 3. Relevant tables
select table_schema, table_name
from information_schema.tables
where table_schema in ('public', 'knowledge')
  and table_name like 'knowledge%';

-- 4. Vector/embedding columns
select table_schema, table_name, column_name, data_type, udt_name
from information_schema.columns
where (table_schema = 'knowledge' or table_name like 'knowledge%')
  and (
    udt_name = 'vector'
    or column_name ilike '%embedding%'
    or column_name ilike '%vector%'
  );

-- 5. Relevant functions
select n.nspname, p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'knowledge')
  and (
    p.proname ilike '%knowledge%'
    or p.proname ilike '%rag%'
    or p.proname ilike '%search%'
  );

-- 6. RLS status
select schemaname, tablename, rowsecurity, forcerowsecurity
from pg_tables
where schemaname in ('public', 'knowledge')
  and tablename like 'knowledge%';

-- 7. Policies
select schemaname, tablename, policyname, roles, cmd, qual, withcheck
from pg_policies
where schemaname in ('public', 'knowledge')
  and tablename like 'knowledge%';

-- 8. Table grants
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'knowledge')
  and table_name like 'knowledge%';

-- 9. Function grants
select routine_schema, routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema in ('public', 'knowledge')
  and routine_name ilike '%knowledge%';

-- 10. PostgREST exposed schemas, if configured
select current_setting('pgrst.db_schemas', true) as pgrst_db_schemas;
```

What these verify:

1. Whether pgvector is installed/available and its version.
2. Whether a `knowledge` schema exists and what schema-level ACLs exist.
3. Whether any knowledge tables already exist.
4. Whether vector/embedding columns and dimensions are already present.
5. Whether search RPCs already exist.
6. Whether RLS is enabled.
7. Which policies exist and for which roles.
8. Whether `anon`/`authenticated` have table grants.
9. Whether `anon`/`authenticated` can execute knowledge RPCs.
10. Whether the custom schema is exposed through PostgREST.

This script does not create, alter, delete, update, or read manuscript/user data.

---

## 9. Phase C.4 evaluation continuity

Frozen artifacts:

- C4 protocol: `c4-protocol-v1`
- Protocol hash: `d2dba136d553ddb959880bc315d4b886474f3559899dadfd171e60574d4541b8`
- C4 question-set hash: `d65b319474378ebc2f0f71ba946f11a4fdbf93417b1c53d05288834eb816d167`
- C4 split: 66 development / 24 calibration / 44 held-out
- C4 test: 30 answerable, 12 unanswerable, 2 unverified

Frozen lexical results:

| Strategy | Recall@5 | Precision@5 | MRR | Pure-Russian Recall@5 |
|---|---:|---:|---:|---:|
| A — original BM25 | 13/30 = 0.433 | 14/150 = 0.093 | 0.361 | 0/10 |
| B — field-weighted BM25 | 14/30 = 0.467 | 18/150 = 0.120 | 0.337 | 0/10 |
| C — semantic | blocked | blocked | blocked | blocked |
| D — hybrid | blocked | blocked | blocked | blocked |

A future D.2 evaluation must use the same C4 fixture and split. Thresholds must be selected only on calibration data. The held-out test must not influence model, dimension, weights, fusion parameters or thresholds.

Acceptance reporting must separate:

- English;
- pure-Cyrillic Russian;
- Russian with Latin proper nouns;
- answerable coverage and evidence recall;
- correct abstention and false acceptance;
- false rejection and evidence misses;
- latency and embedding/index cost.

No production-readiness claim is justified while pure-Russian retrieval is unproven or unanswerable questions are routinely accepted.

---

## 10. Risks and blockers, prioritized

| Severity | Risk / blocker |
|---|---|
| Critical | No approved multilingual embedding model/provider or key. |
| Critical | Live Supabase pgvector/schema/RLS state is unverified. |
| Critical | No remote database credentials or authorized access in this workspace. |
| High | Public manuscript copy exists under `public/`; public-use rights are unconfirmed. |
| High | `unframed_admin` / `unframed_access` are forgeable boolean cookies. |
| High | Legacy `x-admin-key` is a shared secret, not an owner session. |
| High | Admin role storage is inconsistent between `users.role` and `user_metadata.role`. |
| Medium | Rate limiting is process-local, not distributed. |
| Medium | Existing `/api/unframed/content` path points at a missing `content/` directory. |
| Medium | Model dimension and provider choice affect migration and re-indexing. |
| Medium | External embedding provider creates cost, latency and data-processing dependencies. |
| Low | 169 chunks do not justify HNSW/IVFFlat yet. |

---

## 11. Phase D.2 — smallest safe next step

**Do not implement RAG yet.**

The smallest safe next step is:

1. Owner approves or rejects the embedding provider/model and third-party data processing.
2. Owner supplies authorized server-side credentials through the approved environment mechanism.
3. Owner runs the read-only SQL audit in Supabase SQL Editor and returns metadata results.
4. Based on that evidence, draft a migration for review — do not apply it.
5. Implement only local dry-run ingestion and a disabled-by-default retrieval module with tests.
6. Evaluate against the frozen C4 fixture; calibrate only on the calibration split.
7. Enable only after security, retrieval and fallback tests pass.

### D.2 acceptance criteria

- Zero access-control failures.
- Public-only retrieval cannot return owner/private chunks.
- Feature flag off preserves the exact existing Pierrot path.
- Ingestion is idempotent and hash-verified.
- Embedding dimensions/model are recorded and validated.
- C4 evaluation is reported with numerators/denominators.
- Pure-Russian results are reported separately and are not hidden.
- No unanswerable question is treated as proof of an answer.
- No model/provider is activated without explicit approval.

---

## 12. Change log

- Files changed: **none**
- Files created: **none**
- Packages installed: **none**
- Model weights downloaded: **none**
- External API calls: **none**
- Network requests: **none**
- Supabase or database operations: **none**
- Migrations applied: **none**
- Ingestion executed: **none**
- Commits: **none**
- Pushes: **none**
- Deployments: **none**
- Production configuration changes: **none**

**Stopped after the read-only audit. Awaiting explicit approval before Phase D.2.**
