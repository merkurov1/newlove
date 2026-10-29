# Phase D.2 — UNFRAMED RAG: production ingestion attempt

**Date:** 2026-10-29  
**Branch:** `phase-d2-unframed-rag`  
**Status:** stopped before any production write. No embedding API call. No Supabase connection. No ingestion, migration, deploy, commit or push.

---

## 1. Outcome

The production ingestion was **not executed** because the required environment variables are not available in this Codespace.

Required variables checked by presence only, without printing values:

```text
OPENROUTER_API_KEY=missing
NEXT_PUBLIC_SUPABASE_URL=missing
SUPABASE_SERVICE_ROLE_KEY=missing
SUPABASE_URL=missing
```

Additional environment findings:

- `.env` does not exist;
- `.env.local` exists but contains only `VERCEL_OIDC_TOKEN`;
- `.env.production` and `.env.production.local` do not exist;
- the `vercel` CLI is not available in this environment.

Per the task instruction, execution stopped after preflight. No production data was overwritten or deleted.

---

## 2. Repository state

- Working branch: `phase-d2-unframed-rag`.
- Existing working-tree changes were preserved.
- No branch switch, reset, clean, stash or deletion was performed.
- No commit, push or deploy was performed.
- No production environment variable was changed.
- `PIERROT_RAG_ENABLED` was not enabled.

---

## 3. Dry-run result

Command:

```bash
UNFRAMED_EMBEDDING_MODEL=baai/bge-m3 \
bun run scripts/knowledge/phase-d2-ingest.ts --dry-run
```

Result:

| Field                 | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Status                | `dry_run`                                                          |
| Document ID           | `doc_unframed_manuscript`                                           |
| Chunks                | `169`                                                              |
| Embedding batches     | `6`                                                                |
| Embedding model       | `baai/bge-m3`                                                       |
| Embedding dimensions  | `1024`                                                             |
| Source SHA-256        | `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923` |
| Manifest hash         | `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2` |
| Parser version        | `unframed-parser-v1`                                                |
| Chunker version       | `unframed-chunker-v1`                                               |
| Parser checks         | all `true`                                                          |
| Embedding API calls   | `0`                                                                |
| Database writes       | `0`                                                                |

The parser checks that passed:

- `tocExcluded`
- `sectionBoundaries`
- `offsetsValid`
- `uniqueChunkIds`
- `sectionPathsValid`
- `maxChunkCharsRespected`

---

## 4. Source hash verification

Actual SHA-256 of `app/unframed/Unframed.markdown`:

```text
cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923
```

Expected SHA-256:

```text
cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923
```

The source matches the frozen hash.

---

## 5. Supabase and migration checks

### Live checks not performed

Because no Supabase credentials are available, the following could not be verified at runtime:

- that the configured URL belongs to production project `txvkqcitalfbjytmnawq`;
- that `public.knowledge_documents` and `public.knowledge_chunks` exist with the expected columns;
- that the embedding column is live `vector(1024)`;
- that `knowledge_search_unframed` is callable by `service_role`;
- that `anon` and `authenticated` cannot execute the RPC or read the tables;
- that current document count is `0`;
- that current chunk count is `0`;
- that no partial or unexpected rows exist.

### Static review of the local migration

`migrations/2026-10-29_create_knowledge_rag.sql` contains:

- `embedding vector(1024) NOT NULL` in `knowledge_chunks`;
- RLS enabled on both knowledge tables;
- no anon/authenticated policies;
- `REVOKE ALL` from `PUBLIC`, `anon`, `authenticated`;
- direct table grants only to `service_role`;
- RPC `knowledge_search_unframed(...)`;
- RPC execution revoked from `PUBLIC`, `anon`, `authenticated`;
- RPC execution granted only to `service_role`.

Static review is not a substitute for live verification.

### Migration history discrepancy

Recorded as a separate issue:

- the local migration file header still says the migration was proposed for review and not applied;
- per the task context, the production tables already exist;
- the Supabase migration history previously did not show the RAG migration.

The migration was **not re-applied** and the schema was not changed automatically. Production schema and migration history need a separate reconciliation by the project owner.

---

## 6. Ingestion result

Production ingestion was not run.

| Metric                               | Result       |
| ------------------------------------ | ------------ |
| `--apply` runs                       | `0`          |
| Embedding API requests               | `0`          |
| Chunks processed by embeddings       | `0`          |
| Documents written by this attempt    | `0`          |
| Chunks written by this attempt       | `0`          |
| `--allow-stale-delete` used          | No           |
| Confirmed provider cost              | Not available |

No `usage` response exists, so no cost is reported or estimated.

No repair or retry was needed because no write occurred.

---

## 7. Read-only result verification

Not performed, because the Supabase connection is unavailable.

The following remain unconfirmed:

- document count = `1`;
- chunk count = `169`;
- `source_sha256`, `manifest_hash`, parser/chunker versions and embedding model equal the local manifest;
- every embedding is non-NULL and has 1024 dimensions;
- every chunk has a matching document;
- no duplicate IDs, missing chunks or partially written batches;
- `anon` / `authenticated` access remains closed.

---

## 8. Free evaluation

Command:

```bash
bun run scripts/knowledge/phase-d2-evaluate.ts --local-evaluation
```

Result: expected `blocked` state without paid calls.

| Field                          | Value                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| Status                         | `blocked`                                                          |
| Reason                         | `paid_embedding_calls_not_authorized`                              |
| Source SHA-256                 | `cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923` |
| Manifest hash                  | `78f704b33c900897256a7e9a3b6263c3d7114783ae184326be0301d32f0624d2` |
| Question set hash              | `d65b319474378ebc2f0f71ba946f11a4fdbf93417b1c53d05288834eb816d167` |
| Protocol hash                  | `d2dba136d553ddb959880bc315d4b886474f3559899dadfd171e60574d4541b8` |
| Would embed chunks             | `169`                                                              |
| Would embed dev questions      | `66`                                                               |
| Would embed calibration        | `24`                                                               |
| Would call embedding API       | `true`                                                             |
| Would write database           | `false`                                                            |
| Held-out test evaluated        | `false`                                                            |
| Held-out test questions        | `44`                                                               |

Paid generative evaluation was not started.

---

## 9. Tests and checks

| Check                                | Result                          |
| ------------------------------------ | ------------------------------- |
| Source SHA-256                       | Passed                          |
| Ingestion dry run                    | Passed, 169 chunks / 6 batches  |
| RAG unit tests (`lib/knowledge`)      | 7 suites, 85 tests passed       |
| Free evaluation blocked report       | Passed as designed, no paid call |
| Live Supabase preflight              | Not run — credentials missing   |
| Production ingestion                 | Not run                         |
| Read-only post-ingestion integrity   | Not run                         |

Jest was run with `--forceExit`; it reported open handles after the suites completed. This is an existing harness characteristic, not a test failure.

---

## 10. What is needed to continue

Securely connect the following in the Codespace or execution environment:

- `OPENROUTER_API_KEY`;
- `NEXT_PUBLIC_SUPABASE_URL` for production project `txvkqcitalfbjytmnawq`;
- `SUPABASE_SERVICE_ROLE_KEY`.

Use Codespaces secrets, a temporary gitignored env file, or another secret injection mechanism. Do not paste values into chat, terminal output, logs or this report.

After the variables are available, the safe sequence is:

1. Read-only preflight of project URL, tables, columns, `vector(1024)`, RPC grants and current `0/0` row counts.
2. Run `--apply --confirm-paid-embedding` only if preflight passes.
3. Run read-only integrity checks.
4. Run the free evaluation mode.
5. Test retrieval separately with RAG disabled for public visitors.

Do not enable `PIERROT_RAG_ENABLED` for the public site.

---

## 11. Conclusion

Retrieval testing cannot start yet. Production indexing was not performed, live integrity was not verified, and the existing database row counts are unknown. No production data was changed by this attempt.
