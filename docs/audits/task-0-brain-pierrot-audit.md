# Task 0 — Brain & Pierrot Architecture Audit

**Repository:** `newlove`  
**Audited commit:** `2371bbcd` — *Add Brain knowledge ingestion and phrase-gated Brain mode*  
**Branch:** `main`  
**Audit date:** 2026-10-30  
**Mode:** read-only. No code, migration, production data, deployment, commit or push was changed by this audit. This report is the only file added.

> **Live data note.** The database was changing while this audit ran. At `2026-10-30T06:36:44Z` the snapshot was **77 documents / 561 chunks**, not the earlier 74 / 546. A Brain ingestion run was actively processing queued jobs during the audit. All counts below are timestamped and should be re-queried before implementation.

---

## Executive summary

1. **There are two ingestion pipelines sharing one schema.** The UNFRAMED manuscript pipeline (`lib/knowledge/rag/*`) and the Brain article pipeline (`lib/knowledge/brain/*`) both write `knowledge_documents` / `knowledge_chunks`, but use different parsers, chunkers, ID schemes, version strings and admin endpoints.
2. **Brain article ingestion is browser-driven, not durable.** The admin UI calls `POST /api/admin/brain/runs/[id]/next` in a loop. If the tab closes, the run remains `running` with queued jobs. The live database had **2 running runs and 39 queued jobs** at snapshot time.
3. **Whole-Brain retrieval is a single top-5 cosine search.** There is no lexical/BM25 component, no reranker, no diversity rule, no document title in results, and the evidence prompt labels every passage as `UNFRAMED` even when it came from a Novaya Gazeta article.
4. **The RAG feature flag does not gate owner Brain.** `/api/pierrot-web` calls retrieval with `enabled: true`; `PIERROT_RAG_ENABLED` was absent from the audited production env file. Even if it were present, the owner branch would ignore it. Owner Brain therefore runs regardless of the documented flag.
5. **Owner authorization itself is sound in principle.** Owner mode requires a real `ADMIN` user identity; shared `x-admin-key`, `x-admin-secret` / `system-admin` are deliberately excluded from manuscript retrieval.
6. **The UNFRAMED admin ingestion endpoint is now partly self-blocking.** Its preflight and verify logic require `documentCount === 1`; after Brain imported dozens of articles, those checks can no longer pass.
7. **The subscription path is broken in production.** `subscribers` has no `confirmedAt` / `unsubscribedAt` columns and `subscriber_tokens` has no `expires_at` / `usedAt` columns, while `/api/subscribe` and `/api/newsletter-confirm` use them. All **51** subscription events in the live table are `subscription_failed` with reason `lookup`. This directly breaks the `journal_flow` Pierrot offer.
8. **Commercial analytics are written before generation succeeds.** `offer_selected`, `offer_viewed` and `cta_shown` are recorded before DeepSeek is called; a failed generation leaves funnel events for a CTA the visitor never saw.
9. **Admin authorization is inconsistent.** Brain endpoints use `authorizeKnowledgeAdmin` (session/Telegram/JWT/GitHub owner); the older UNFRAMED endpoint has its own GitHub-only authorization. Separately, `app/api/admin/items/[id]/publish/route.ts` has **no authorization at all** while using the service-role client.
10. **Database isolation for the new tables is good.** RLS is enabled on all nine reviewed tables, no anon/authenticated policies exist, and only `service_role` has table privileges. The main remaining database work is schema reconciliation, foreign keys, a global active-job uniqueness rule and optional vector indexing.

---

## A. Current architecture and actual execution flow

### A.1 Component map

```text
Browser / Telegram
    │
    ├── components/pierrot/PierrotContext.tsx
    │       └── POST /api/pierrot-web
    │
    └── app/api/pierrot/route.ts (Telegram grammY adapter)
            └── server-to-server POST /api/pierrot-web

/api/pierrot-web
    ├── lib/serverAuth.ts            identity / admin verification
    ├── lib/pierrot/conversation.ts  validation, consent, language
    ├── lib/pierrot/intents.ts       rule-based intent classification
    ├── lib/pierrot/commercial.ts    deterministic response/offer planning
    ├── lib/pierrot/strategy.ts      proactive offer scoring and state
    ├── lib/pierrot/offers.ts        verified offer catalogue
    ├── lib/pierrot/serviceInquiry*  Advising / Art Engine lead qualification
    ├── lib/pierrot/serverStore.ts   conversations, messages, events (service role)
    ├── lib/knowledge/rag/*          owner Brain retrieval
    └── OpenAI SDK → DeepSeek

Admin Brain
    app/admin/brain/BrainIngestionClient.tsx
        ├── POST /api/admin/brain/analyze
        ├── POST /api/admin/brain/runs
        └── POST /api/admin/brain/runs/[id]/next   (one article per request)
                └── lib/knowledge/brain/process.ts
                        ├── lib/knowledge/brain/url.ts
                        ├── lib/knowledge/brain/extract.ts
                        ├── lib/knowledge/brain/chunk.ts
                        ├── lib/knowledge/rag/embeddings.ts
                        └── lib/knowledge/brain/store.ts

UNFRAMED manuscript admin
    POST /api/admin/knowledge/unframed-run
        └── lib/knowledge/rag/ingestion.ts → lib/knowledge/rag/supabaseStore.ts
```

### A.2 Owner Brain request flow (actual)

1. The browser sends `POST /api/pierrot-web` with `mode: 'unframed'`, message, history, consent, conversation/session IDs and page context.
2. The route applies an in-process rate limit (`lib/rateLimit.ts`), validates message length and IDs, and rejects unknown modes.
3. Identity resolution:
   - `getCurrentUser()` reads the Supabase cookie session and the `users.role` profile.
   - `requireAdminFromRequest()` is consulted only if `x-telegram-init-data`, `x-admin-secret` or `Authorization` is present.
   - `ragOwnerAuthorized` is set only by `isVerifiedOwnerUser` (real user role `ADMIN`) or `isVerifiedOwnerCredential` (real credential, excluding `system-admin`).
   - `x-admin-key` can set `isAdmin` for the persona, but does **not** set `ragOwnerAuthorized`.
4. If `ownerMode` is true and `ragOwnerAuthorized` is false, the route returns `403`.
5. Conversation, message and event persistence are best-effort through the service-role client and SQL RPCs. Transcript writes require `consent.state === 'granted'`; metadata writes are allowed unless consent is explicitly `denied`.
6. Intent classification still runs in owner mode, even though the commercial planner is not used. Service-inquiry qualification is skipped.
7. `planPierrotResponse` is still called; `ownerMode` suppresses the commercial prompt and commercial response extras.
8. The route enters the owner RAG branch:
   - `retrieveUnframedEvidence({ scope: 'owner', ownerAuthorized: true, enabled: true })`
   - OpenRouter `baai/bge-m3` embeds the query (1024 dimensions).
   - Supabase RPC `knowledge_search_unframed` runs one cosine-distance query across all owner documents.
   - Results are sorted and filtered again in JavaScript at the configured threshold.
   - The route builds an evidence prompt with a 8,000-character JSON budget and returns short source excerpts to the browser.
9. DeepSeek (`deepseek-chat`, or `deepseek-reasoner` when the admin message matches reasoning keywords) generates the reply. There is no provider fallback.
10. Assistant message and events are persisted; the response includes `rag.outcome` and `rag.sources`.

**Actual consequence:** owner Brain is “top-5 vector search over all owner documents + one LLM call”. It is not a multi-document synthesis pipeline, and it cannot tell the model which document a passage came from unless the passage text itself is descriptive.

### A.3 Public Pierrot flow (actual)

1. Same `/api/pierrot-web` route with `mode: 'site'` (or no mode).
2. No RAG call is made.
3. Intent → service inquiry (if applicable) → page context → commercial state → `planPierrotResponse`.
4. The plan either returns deterministic copy/CTA/actions or sets `useModel: true`.
5. For model paths, the system prompt is public persona + page context + commercial decision block; DeepSeek returns prose.
6. CTA, routes, offers, prices and links are selected by code, not by the model. The model is only allowed to write prose.
7. Server events and client telemetry are recorded; the browser renders CTA, links, actions, evidence and RAG outcome.

### A.4 Telegram flow

1. `app/api/pierrot/route.ts` is a grammY webhook.
2. It loads history from `pierrot_messages` using `createTelegramPierrotIds`.
3. It calls `/api/pierrot-web` server-to-server with:
   - `x-pierrot-internal: PIERO_API_SECRET || ADMIN_SECRET_KEY`
   - `x-telegram-user-id`
   - `x-admin-key` only for IDs in `TELEGRAM_ALLOWED_USER_IDS`
4. The web route treats this as an internal request for rate-limit bucketing only. Because the internal call carries no user JWT or Telegram `initData`, a Telegram admin gets the owner **persona** via `x-admin-key`, but cannot unlock owner RAG.
5. Webhook secret enforcement is opt-in (`TELEGRAM_WEBHOOK_ENFORCE_SECRET === '1'`). If the variable is absent, the webhook accepts updates without Telegram’s secret token.

### A.5 Brain article ingestion flow (actual)

1. `app/admin/brain/BrainIngestionClient.tsx` posts pasted URLs to `/api/admin/brain/analyze`.
2. Analyze normalizes each URL, removes tracking parameters, loads existing article documents (up to 5,000), and labels rows `new`, `existing`, `invalid` or `duplicate_in_input`.
3. Start posts to `/api/admin/brain/runs`. That route repeats the URL checks, also checks for active jobs in other runs, creates a `brain_ingestion_runs` row (`running`) and inserts `brain_ingestion_jobs` rows (`queued`).
4. The browser then loops `POST /api/admin/brain/runs/[id]/next`; each request processes one job.
5. `processNextBrainJob`:
   - loads the run,
   - reclaims `processing` jobs older than 900 seconds,
   - returns `paused` if the run is paused/cancelled,
   - claims one queued job atomically with `brain_claim_next_job` (`FOR UPDATE SKIP LOCKED`),
   - checks for a completed duplicate by normalized URL,
   - fetches HTML with `fetchHtmlSafely` (SSRF checks, redirect re-validation, 3 MB cap, 20 s timeout),
   - extracts article text with Cheerio scoring (`extractArticle`),
   - normalizes the canonical URL and checks canonical/content-hash duplicates,
   - chunks the article (`chunkArticle`, max 2,400 chars, 300 overlap),
   - embeds chunk inputs with BGE-M3,
   - inserts the document with `ingestion_status: 'pending'`,
   - upserts chunks in batches of 25,
   - marks the document and job `completed`.
6. Failures are classified as retryable/non-retryable. Retryable jobs are re-queued with `retry_after`; exhausted jobs become `failed`. A run becomes `completed` or `completed_with_errors` when no queued/processing jobs remain.
7. There is **no server worker**. The browser is the worker. If it stops, the run stays `running`.

**Live evidence:** at snapshot time, run `4a9fba51-...` had 16 completed / 33 queued / 1 partial and run `933ebd7a-...` had 39 completed / 6 queued. Both runs were still `running`.

### A.6 UNFRAMED manuscript ingestion flow (actual)

1. `POST /api/admin/knowledge/unframed-run` authorizes only a GitHub token whose login equals `VERCEL_GIT_REPO_OWNER` (default `merkurov1`).
2. `preflight` reads `app/unframed/Unframed.markdown`, verifies a hard-coded SHA-256, builds the frozen 169-chunk manifest, checks env/schema/RPC/anonymous closure, and requires `documentCount <= 1`.
3. `ingest` builds the plan, embeds all chunk inputs (`baai/bge-m3`), and calls `applyUnframedIngestion`.
4. `applyUnframedIngestion` lists existing chunk IDs for the document, refuses to delete stale chunks unless `allowStaleDelete` is true, upserts the document and chunks, then deletes stale chunks if allowed.
5. `verify` reads the document and chunks and asserts integrity, including `documentCount === 1`.

**Regression:** after Brain imported 76 articles, `documentCount` is 77. The manuscript preflight’s `check.idempotency` and `verify`’s `documentCountIsOne` are false. The manuscript endpoint can no longer re-ingest or verify the manuscript in the current database.

### A.7 Commercial and attribution flow (actual)

1. `classifyPierrotIntent` turns the message into an intent, confidence, offer id, section id, topic and commercial flags.
2. `planPierrotResponse` chooses one of: model, offer, navigation, decline, unknown product, clarify, handoff.
3. Offer facts come from `lib/pierrot/offers.ts`; direct-offer replies are hard-coded bilingual strings in `lib/pierrot/commercial.ts`.
4. Runtime facts are read only from:
   - `postcards` for Heart & Angel price/availability,
   - `subscribers` for Journal/Flow subscription status.
5. CTA destinations are verified against static allowlists; the model cannot add a route.
6. Client clicks add attribution parameters:
   - `pcard_<conversationId>` for postcards,
   - `psub_<conversationId>` for subscriptions,
   - `punf_<conversationId>` for UNFRAMED.
7. Checkout endpoints write `checkout_started`; trusted Stripe handlers write `order_paid` / `unframed_purchase_confirmed`.
8. Commercial state is reconstructed from client history plus trusted server events and `subscription_events`.

### A.8 Analytics flow (actual)

- Server events: `recordPierrotEvent` → SQL `pierrot_record_event` → `pierrot_events`.
- Client events: `trackPierrotEvent` → `POST /api/pierrot/events` → payload sanitizer → same SQL function.
- Service leads: `art_service_leads`, with events in `pierrot_events`.
- Subscription lifecycle: `subscription_events` (separate table).
- Admin dashboard: `loadPierrotDashboard` reads conversations, messages, events, subscription events, leads and postcard orders; `buildPierrotSnapshot` produces overview, funnels, insights and recommendations.

### A.9 Live snapshot

| Item | Value at `2026-10-30T06:36:44Z` |
|---|---:|
| `knowledge_documents` | 77 |
| — article documents | 76 |
| — manuscript documents | 1 |
| `knowledge_chunks` | 561 |
| — manuscript chunks | 169 |
| — article chunks | 392 |
| article domains | 60 `novayagazeta.ru` (353 chunks), 16 `merkurov.substack.com` (39 chunks) |
| `brain_ingestion_runs` | 4 (2 completed, 2 running) |
| `brain_ingestion_jobs` | 116 (76 completed, 39 queued, 1 partial) |
| `pierrot_conversations` | 67 |
| `pierrot_messages` | 116 (28 conversations have stored messages) |
| `pierrot_events` | 443 |
| `art_service_leads` | 2 (both `new`, `need_type=consultation`) |
| `subscription_events` | 51 (all `subscription_failed`, `reason=lookup`) |

Corpus quality observations:

- Article documents average **5.16 chunks** each (range 1–8); manuscript has 169.
- **80 chunks are shorter than 200 characters; 77 are shorter than 50; the minimum is 8 characters.**
- Many tiny chunks are Substack interface text such as `"No posts"`. These are index pollution, not article content.
- There are 4 duplicated content hashes across different documents (not duplicated within a document).
- There is **no vector index** on `knowledge_chunks.embedding`; every search is an exact scan. At 561 chunks this is acceptable, but it will not scale indefinitely.

---

## B. File-by-file map of relevant implementation

### B.1 Knowledge / RAG core

| File | Role | Key observations |
|---|---|---|
| `lib/knowledge/types.ts` | UNFRAMED manifest/types | Frozen parser/chunker contracts. |
| `lib/knowledge/unframed.ts` | Manuscript parser, 169-chunk builder, SHA checks | `unframed-parser-v1`, `unframed-chunker-v1`, 2,400/300 chunking. |
| `lib/knowledge/rag/config.ts` | Model, dimensions, top-K, thresholds, feature flag | Hard-codes `baai/bge-m3`, 1024, top-K 5, 0.45 provisional threshold, `PIERROT_RAG_ENABLED`. |
| `lib/knowledge/rag/types.ts` | Retrieval and repository contracts | `KnowledgeSearchRow` has no document title/source type. |
| `lib/knowledge/rag/embeddings.ts` | OpenRouter embedding client | Batches of 32, 20 s timeout, model alias validation, provider pin optional. |
| `lib/knowledge/rag/retrieval.ts` | Owner retrieval orchestration | Clamps top-K to 5, calls SQL with `minSimilarity: -1`, filters at threshold in JS, never throws. |
| `lib/knowledge/rag/supabaseStore.ts` | Service-role document/chunk repository and search | RPC `knowledge_search_unframed`; `ingestion_version` schema fallback. |
| `lib/knowledge/rag/ingestion.ts` | Manuscript ingestion plan/apply | Deterministic IDs; stale-chunk deletion requires explicit flag. |
| `lib/knowledge/rag/pierrotContext.ts` | Evidence and unavailable prompts | Every evidence block is hard-labeled `source: 'UNFRAMED'`; 8,000-char budget. |
| `lib/knowledge/rag/evidence.ts` | Browser evidence excerpts | 280-char excerpts; no document title/source. |
| `lib/knowledge/rag/authorization.ts` | Owner identity rules | Real `ADMIN` only; excludes `system-admin` and missing IDs. |
| `lib/knowledge/rag/errors.ts` | Typed retrieval/ingestion failures | Used for fail-closed outcomes. |
| `lib/knowledge/rag/evaluation.ts` | Semantic evaluation helpers | Cosine ranking, Recall@5, Precision@5, MRR; evaluation-only. |
| `lib/knowledge/evaluation/*` | C1–C4 offline evaluation harnesses | BM25, semantic bake-off, abstention policies; **not wired into production retrieval**. |

### B.2 Brain ingestion

| File | Role | Key observations |
|---|---|---|
| `lib/knowledge/brain/url.ts` | URL normalization, SSRF guard, safe fetch | Tracking stripping, private-IP checks, redirect re-validation, 3 MB/20 s caps. DNS is resolved before fetch but not pinned. |
| `lib/knowledge/brain/extract.ts` | Cheerio article extraction | Scored main-root selection, noise removal, JSON-LD metadata, paywall detection, canonical URL. |
| `lib/knowledge/brain/chunk.ts` | Article chunking | `brain-article-chunker-v1`, 2,400/300; tiny sections can become tiny chunks. |
| `lib/knowledge/brain/process.ts` | One-job worker | Claims, fetches, extracts, dedupes, embeds, writes, retries, finalizes. |
| `lib/knowledge/brain/store.ts` | Service-role Brain repository | Runs, jobs, duplicate lookup, document/chunk writes; no stale-chunk cleanup for articles. |
| `app/api/admin/brain/analyze/route.ts` | URL pre-analysis | Duplicates `/runs` URL logic. |
| `app/api/admin/brain/runs/route.ts` | List/create runs | Repeats URL checks; race window before job insertion. |
| `app/api/admin/brain/runs/[id]/route.ts` | Run/job polling | Admin only. |
| `app/api/admin/brain/runs/[id]/next/route.ts` | Process one job | Admin only; builds embedding client from env. |
| `app/api/admin/brain/runs/[id]/pause/route.ts` | Pause run | Cosmetic response can report `paused` for a non-running run. |
| `app/api/admin/brain/runs/[id]/resume/route.ts` | Resume paused run | Does not recover stale `running` runs. |
| `app/api/admin/brain/runs/[id]/retry/route.ts` | Reset failed/partial jobs | Reuses `resetFailedJobs`. |
| `app/admin/brain/BrainIngestionClient.tsx` | Browser worker UI | Loops up to 2,000 `next` calls; browser close stops the run. |
| `app/admin/brain/page.tsx` | Admin page shell | Uses `requireAdmin`. |

### B.3 Pierrot core

| File | Role | Key observations |
|---|---|---|
| `lib/pierrot/intents.ts` | Rule-based intent classifier | 724 lines of bilingual term lists and score thresholds; no model classifier. |
| `lib/pierrot/commercial.ts` | Deterministic plan and direct replies | Hard-coded bilingual offer copy; planner chooses offers/CTAs. |
| `lib/pierrot/strategy.ts` | Proactive offer scoring and state | Term lists, page context, introduction limits, suppression. |
| `lib/pierrot/offers.ts` | Verified offer catalogue | Static facts, unknowns, verified CTA allowlists. |
| `lib/pierrot/offerAvailability.ts` | Runtime price/stock/subscription facts | Reads `postcards` and `subscribers`; failures degrade to unverified. |
| `lib/pierrot/pageContext.ts` | Route-to-offer hints | Page context never creates intent by itself. |
| `lib/pierrot/conversation.ts` | IDs, consent, limits, event payload sanitizer | Consent defaults to `granted` on the client; event payloads are strictly allow-listed. |
| `lib/pierrot/serverStore.ts` | Conversations/messages/events persistence | Session-checked RPCs; service-role client; 90-day expiry. |
| `lib/pierrot/commercialAnalytics.ts` | Server commercial events | Writes intent/offer/CTA/decline events before generation succeeds. |
| `lib/pierrot/serviceInquiry.ts` | Deterministic lead qualification | Need/stage/timeline parsing; max 3 questions. |
| `lib/pierrot/serviceInquiryStore.ts` | Lead persistence and events | `art_service_leads`; no FK to conversations. |
| `lib/pierrot/orderAttribution.ts` | Opaque checkout attribution | `pcard_`, `psub_`, `punf_` refs; no PII. |
| `lib/pierrot/clientTelemetry.ts` | Browser event sender | `keepalive`, consent-gated, only sanitized payloads. |
| `lib/pierrot/brain.ts` | Brain activation phrases and examples | Exact phrase gate; examples in RU/EN. |
| `lib/pierrot/navigation.ts` | Sections, routes, actions, links | Used by planner and UI. |
| `lib/pierrot/linkify.ts` | Internal route linkification | Safe route list. |
| `app/api/pierrot-web/route.ts` | Main web/Telegram Brain route | Identity, planner, RAG, DeepSeek, persistence. |
| `app/api/pierrot/route.ts` | Telegram bot adapter | Webhook, commands, history, internal call. |
| `app/api/pierrot/events/route.ts` | Client telemetry write-only endpoint | No GET; consent required. |
| `app/api/pierrot/conversations/route.ts` | Browser deletion | Requires both random IDs. |
| `components/pierrot/PierrotContext.tsx` | Chat state and request lifecycle | Brain activation, history, mode, evidence, telemetry. |
| `components/pierrot/PierrotConversation.tsx` | Message/CTA/evidence rendering | CTA attribution, source excerpt display. |
| `components/pierrot/PierrotComposer.tsx` | Input surface | Message composition. |

### B.4 Admin, analytics and checkout integrations

| File | Role | Key observations |
|---|---|---|
| `lib/serverAuth.ts` | Central auth | Cookie session, Telegram initData, bearer JWT, `x-admin-secret` (`system-admin`). |
| `lib/knowledge/adminAuth.ts` | Knowledge admin auth | Admin credential or GitHub owner token. |
| `lib/analytics/pierrotIntelligence.ts` | Dashboard aggregation/export | Reads all conversation tables; builds funnels/insights; redacts PII on export. |
| `app/admin/pierrot/page.tsx` | Pierrot dashboard | `requireAdmin` server-side. |
| `app/api/admin/pierrot/conversations/route.ts` | Admin conversation deletion | Cleans leads/subscription events manually. |
| `app/api/admin/pierrot/export/route.ts` | Admin transcript export | Redacts email/phone/secrets. |
| `app/api/admin/knowledge/unframed-run/route.ts` | Manuscript ingestion/evaluation | GitHub-owner-only; document-count-one assumption. |
| `app/api/postcards/order/route.ts` | Postcard checkout | Writes `checkout_started`; uses env base URL. |
| `app/api/stripe/webhook/route.ts` | Trusted payment handler | Writes `order_paid` / `unframed_purchase_confirmed`. |
| `app/api/unframed/checkout/route.ts` | UNFRAMED checkout | Trusts request `Origin` for success URL. |
| `app/api/unframed/verify/route.ts` | UNFRAMED access verification | Writes purchase event; sets access cookie. |
| `app/api/subscribe/route.ts` | Subscription form endpoint | Uses columns absent from live `subscribers` / `subscriber_tokens`. |
| `app/api/newsletter-confirm/route.ts` | Confirmation endpoint | Same schema mismatch; writes `subscription_confirmed`. |
| `lib/newsletter/subscriptionEvents.ts` | Subscription event writer | Best-effort upsert into `subscription_events`. |

### B.5 Migrations relevant to this audit

| File | Purpose |
|---|---|
| `migrations/2026-10-29_create_knowledge_rag.sql` | Initial `knowledge_documents`/`knowledge_chunks`, RLS, search RPC. |
| `migrations/2026-10-30_brain_knowledge_ingestion.sql` | Article provenance columns, Brain runs/jobs, claim RPC, whole-Brain search RPC. |
| `migrations/2026-10-29_create_pierrot_conversations.sql` | Conversations, messages, events, RPCs, retention helper. |
| `migrations/2026-10-29_add_pierrot_commercial_events.sql` | Commercial event names. |
| `migrations/2026-10-29_add_pierrot_order_paid_event.sql` | `order_paid`. |
| `migrations/2026-10-29_extend_pierrot_service_events.sql` | Service-inquiry and subscription CTA events. |
| `migrations/2026-10-29_add_pierrot_checkout_events.sql` | `offer_selected`, `checkout_started`. |
| `migrations/2026-10-30_repair_pierrot_event_constraint.sql` | Final 26-event constraint and `pierrot_record_event`. |
| `migrations/2026-10-29_create_art_service_leads.sql` | `art_service_leads`. |
| `migrations/2026-10-29_create_subscription_events.sql` | `subscription_events`. |
| `migrations/2025-11-08_add_token_expiry.sql` | Intended `subscriber_tokens.expires_at`; **not reflected in the live schema**. |

---

## C. Existing database schema and relationships

### C.1 Knowledge tables

**`knowledge_documents`**

| Column | Type | Notes |
|---|---|---|
| `id` text PK | `^[a-z0-9_]{3,64}$` | `doc_unframed_manuscript`, `doc_article_<32 hex>`. |
| `title`, `source_path`, `source_sha256`, `manifest_hash` | text | `source_path` cannot start with `public/`. |
| `parser_version`, `chunker_version` | text | Manuscript vs article versions differ. |
| `ingestion_version` | text **nullable** | Live drift: manuscript row is `NULL`; version is in `metadata`. |
| `embedding_model`, `embedding_dimensions` | text/integer | Constrained to `baai/bge-m3` / 1024. |
| `access_class` | text | `public` or `owner`; all live rows are `owner`. |
| `chunk_count`, `source_char_count` | integer | Declared counts. |
| `metadata` jsonb | object, ≤8 KB | Holds ingestion version and extraction diagnostics. |
| `source_type`, `source_url`, `canonical_url`, `normalized_url`, `content_hash`, `language`, `author`, `published_at`, `extraction_status`, `ingestion_status`, `processed_at` | mixed | Added by the Brain migration. `ingestion_status` defaults `completed`. |

Unique constraints/indexes:
- PK `id`
- unique `(id, embedding_model, embedding_dimensions)`
- partial unique `canonical_url` for `source_type='article'`
- partial unique `normalized_url` for articles
- partial unique `content_hash` for articles
- btree `(source_type, created_at desc)`
- partial btree `normalized_url`

**`knowledge_chunks`**

| Column | Notes |
|---|---|
| `id` text PK | `^chk_[a-f0-9]{32}$`. |
| `document_id` text | Composite FK to document/model/dimensions. |
| `embedding_model`, `embedding_dimensions` | Same constraints as document. |
| `chunk_index`, `section_index`, `char_start`, `char_end`, `line_start`, `line_end` | Deterministic coordinates. |
| `content` | 1–4,000 chars. |
| `content_hash` | SHA-256. |
| `heading`, `section_path` | Retrieval display metadata. |
| `access_class` | `public`/`owner`. |
| `embedding` | `vector(1024)`, not indexed. |
| `metadata` | jsonb. |

Relationship:
```text
knowledge_documents 1 ─── N knowledge_chunks
    ON DELETE CASCADE via (document_id, embedding_model, embedding_dimensions)
```

### C.2 Brain ingestion tables

**`brain_ingestion_runs`**
- `id uuid` PK
- `status` in `running|paused|completed|completed_with_errors|failed|cancelled`
- `metadata` jsonb
- `created_at`, `updated_at`, `completed_at`

**`brain_ingestion_jobs`**
- `id uuid` PK
- `run_id uuid` FK → `brain_ingestion_runs(id)` ON DELETE CASCADE
- `input_url`, `normalized_url`, `canonical_url`, `final_url`
- `status` in `queued|processing|completed|duplicate|partial|failed|cancelled`
- `attempts`, `max_attempts`, `retry_after`
- `document_id` **no FK**
- `content_hash`, `title`, `language`, `error_code`, `error_detail`
- `extraction_status`, `extraction_metadata`
- `worker_id`, `locked_at`, `started_at`, `processed_at`
- unique `(run_id, normalized_url)`
- indexes: `(run_id,status,created_at)`, partial queued claim index `(status,retry_after,created_at) WHERE status='queued'`

**Important gap:** uniqueness is per run, not global. Two different runs can queue the same normalized URL concurrently; the route’s `findActiveJobsByUrls` check is not atomic.

### C.3 Pierrot tables

**`pierrot_conversations`**
- `id` text PK, `session_id` text (both `^[A-Za-z0-9_-]{8,64}$`)
- `status` `active|ended|expired`
- `consent_state` `pending|granted|denied`; `consent_version`
- `language` `ru|en|und`
- `start_page`, `referrer`
- `started_at`, `updated_at`, `last_message_at`, `ended_at`, `expires_at`
- `next_message_sequence`
- indexes on `session_id`, `started_at desc`, `expires_at`

**`pierrot_messages`**
- `id` text PK, `conversation_id` FK → conversations ON DELETE CASCADE
- `role` `user|assistant`
- `content` 1–4,000 chars
- `message_index` > 0; unique `(conversation_id, message_index)`
- `provider` `gemini|deepseek|openrouter`

**`pierrot_events`**
- `id uuid` PK, `conversation_id` FK ON DELETE CASCADE
- `event_name` constrained to the current 26-event list
- `event_key` `^[A-Za-z0-9_.:-]{1,160}$`; unique `(conversation_id, event_key)`
- `payload` jsonb object ≤4 KB
- `created_at`
- indexes on `(conversation_id, created_at)` and `(event_name, created_at desc)`

### C.4 Lead and subscription tables

**`art_service_leads`**
- `id` text PK
- `conversation_id` text, UNIQUE, **no FK** to `pierrot_conversations`
- `status` `new|qualified|contact_requested|contacted|closed`
- `need_type`, `stage`, `timeline`, `questions_asked`, `next_question`
- `last_message_id`, `summary`, `contact_name`, `contact_email`, `consent_at`, `submitted_at`
- timestamps
- index `(status, created_at desc)`

**`subscription_events`**
- `id uuid` PK
- `event_name` `subscription_submitted|subscription_confirmed|subscription_failed|unsubscribe`
- `event_key` unique
- `subscriber_id` text, `conversation_id` text (**no FK**)
- `payload` jsonb object ≤2 KB
- indexes on `(event_name, created_at desc)` and `(subscriber_id, created_at desc)`

### C.5 RLS, grants and functions (verified live)

- All nine reviewed tables have **RLS enabled** and **no policies**.
- `anon` and `authenticated` have **no table privileges**.
- `service_role` has the expected DML privileges.
- `knowledge_search_unframed`, `brain_claim_next_job`, `pierrot_append_message`, `pierrot_record_event` and `purge_expired_pierrot_conversations` are `SECURITY DEFINER`.
- `anon`/`authenticated` cannot execute any of those functions; `service_role` can.
- `knowledge_search_unframed` and `brain_claim_next_job` set `search_path = public, pg_temp`; vector extension is installed in `public`.
- `pierrot_events_event_name_check` is validated and matches the TypeScript event list.
- No vector index exists on `knowledge_chunks.embedding`.

### C.6 Live schema drift

1. `knowledge_documents.ingestion_version` is nullable in production and one row is `NULL`; the code has a metadata fallback.
2. `subscribers` has **no** `confirmedAt` or `unsubscribedAt` columns, but `/api/subscribe` selects/updates them.
3. `subscriber_tokens` has **no** `expires_at` or `usedAt` columns, but `/api/subscribe` and `/api/newsletter-confirm` use them. `migrations/2025-11-08_add_token_expiry.sql` has not been applied to the live schema.
4. `postcards` uses camelCase (`price`, `available`, `featured`), which `offerAvailability.ts` correctly reads.
5. `pierrot_events` has the final 26-name constraint; older migrations would narrow it if applied out of order, which is why the repair migration exists.

---

## D. Current RAG retrieval algorithm

### D.1 Constants

| Constant | Value | Source |
|---|---|---|
| Model | `baai/bge-m3` | `lib/knowledge/rag/config.ts` |
| Dimensions | 1024 | same |
| Embedding batch | 32 | same |
| Embedding timeout | 20,000 ms | same |
| Retrieval top-K | 5 (hard maximum) | same |
| Context budget | 8,000 chars | same |
| Retrieval timeout | 1,500 ms | same |
| Max query chars | 2,000 | same |
| Similarity threshold | 0.45 provisional (env override) | same |
| SQL match limit | 1–10 | `knowledge_search_unframed` |
| Evidence excerpt | 280 chars | `evidence.ts` |

### D.2 End-to-end algorithm

```text
query
  → trim; reject empty or > 2,000 chars
  → resolve model/dimensions and threshold
  → clamp topK to 1..5
  → abort controller 1,500 ms
  → embed query with baai/bge-m3 (OpenRouter)
  → validate vector count, length 1024, finite numbers
  → RPC knowledge_search_unframed(
        query_vector,
        model_id,
        dimensions,
        access_class = 'owner',
        document_id = NULL,          -- whole Brain
        match_count = topK,
        min_similarity = -1          -- no SQL threshold
     )
  → SQL:
        FROM knowledge_chunks c
        JOIN knowledge_documents d
          ON d.id = c.document_id
         AND d.embedding_model = c.embedding_model
         AND d.embedding_dimensions = c.embedding_dimensions
        WHERE (document_id IS NULL OR c.document_id = document_id)
          AND d.ingestion_status = 'completed'
          AND c.access_class = access_class
          AND d.access_class = access_class
          AND c.embedding_model = model_id
          AND c.embedding_dimensions = dimensions
          AND d.embedding_model = model_id
          AND d.embedding_dimensions = dimensions
          AND 1 - (c.embedding <=> query_vector) >= -1
        ORDER BY c.embedding <=> query_vector
        LIMIT match_count
  → JS: filter malformed rows, sort by similarity desc, slice topK
  → if empty: outcome = 'no_match'
  → filter similarity >= threshold
  → if none: outcome = 'weak_match'
  → else: outcome = 'relevant_results'
```

### D.3 Filters

- **Access class:** `owner` for production owner Brain; `public` is supported by types/SQL but has no production caller.
- **Document scope:** omitted (`NULL`) in `/api/pierrot-web`, so all owner documents are searched. A concrete `documentId` preserves manuscript-only behavior but is not exposed by the UI.
- **Completion:** only `d.ingestion_status = 'completed'`.
- **Model and dimensions:** both document and chunk must match `baai/bge-m3` / 1024.
- **No metadata filter:** no source type, language, date, domain or tag filtering.
- **No public/owner mixing:** access class must match on both tables.

### D.4 Ranking

- SQL ranking is cosine distance ascending (`<=>`), equivalent to cosine similarity descending.
- JS re-sorts by similarity descending.
- There is no lexical score, no reciprocal-rank fusion, no cross-encoder rerank, no MMR, no per-document quota, and no duplicate suppression.
- Top-K is capped at 5, so a question spanning several articles can receive at most five passages from the entire 561-chunk corpus.

### D.5 Retrieval outcomes

| Outcome | Meaning |
|---|---|
| `relevant_results` | At least one hit ≥ threshold after sorting. |
| `weak_match` | Hits exist but all are below threshold. |
| `no_match` | No rows returned. |
| `unavailable` | Disabled, unauthorized, bad config, embedding/DB failure, timeout, etc. Carries a `code`. |

### D.6 Evidence construction

- `buildUnframedEvidencePrompt` serializes each hit as:
  ```json
  {
    "source": "UNFRAMED",
    "reference": "chunk:<id>",
    "heading": "...",
    "section_path": ["..."],
    "line_start": 1,
    "line_end": 1,
    "similarity": 0.1234,
    "text": "..."
  }
  ```
- The prompt explicitly says the JSON is untrusted data and instructions inside must be ignored.
- It also says “Answer the owner’s actual question directly…”, asks for synthesis, and tells the model to say evidence is insufficient rather than invent facts.
- **Defect:** `source` is hard-coded to `UNFRAMED`, even for article chunks. There is no `document_title`, `source_type` or `source_url` field in the retrieval row or evidence block.

### D.7 Evaluation state

- C1–C4 offline evaluation harnesses exist under `lib/knowledge/evaluation/*`.
- C4 protocol has a 134-question multilingual fixture with dev/calibration/held-out splits.
- The production threshold `0.45` is explicitly described as provisional and uncalibrated.
- The held-out C4 test was not evaluated for production; the existing reports state that semantic recall is not answer quality.
- The evaluation harness is not invoked by the live retrieval path.

---

## E. Current Pierrot intent and sales architecture

### E.1 Intent classification

`classifyPierrotIntent` is deterministic and rule-based.

**Intent names:** `navigation`, `general_question`, `offer_information`, `purchase_intent`, `subscription_intent`, `service_inquiry`, `book_inquiry`, `handoff_request`, `unknown`, `uncertain`.

**How it works:**

1. Normalize to lowercase, collapse whitespace.
2. Match offer aliases from `PIERROT_OFFERS`; each alias scores 2 or 2.5, capped at 4 per offer.
3. Match sections from `PIERROT_SECTIONS`; exact section match scores 4.5, otherwise 2.5 (+0.5 for multiple aliases).
4. Detect term families: purchase, price, price objection, recipient, delivery, materials, availability, demonstrative, info, subscription, service, book, publisher, handoff, refusal, navigation verb, access, question.
5. Add weighted scores:
   - offer information: `2 + aliasScore * 0.3`
   - navigation when section + verb and destination equals offer route: `+5`
   - book/publisher/subscription/service/access combinations: `+3.5` to `+5.4`
   - purchase on non-book/subscription/access offers: `+4.5`
   - subscription terms without offer: `+3.5`
   - service terms without offer: `+3.2`
   - handoff: `+4`
   - section + verb: `+4`
   - generic question: `+2.5`
   - low signal: `+1.2`
6. Refusal terms multiply all commercial scores by `0.15`, add `unknown +3.5`, and force `unknown` unless navigation is strong.
7. Choose top score. If top < 2.2 → `unknown`; if margin < 0.6 and intent is not navigation → `uncertain`.
8. Confidence = `min(0.95, max(0.2, 0.32 + topScore*0.085 + margin*0.03))`; capped at 0.55 for unknown/uncertain.

**Commercial topic:** `price_objection`, `price`, `purchase`, `recipient`, `delivery`, `materials`, `availability`, `product`.

**Special flags:** `declined`, `unknownProduct`, `accessRequest`, `publisherIntent`, `signals`.

**Important limitation:** this is keyword/score logic with bilingual term lists. It has no learned classifier, no embedding-based semantic intent, no confidence calibration on a labeled production set, and no server-side audit of ambiguous cases.

### E.2 Commercial planner

`planPierrotResponse` modes:

| Mode | Behavior |
|---|---|
| `model` | Model writes prose; no CTA unless a proactive offer is selected. |
| `offer` | Deterministic copy + verified CTA for one offer. |
| `navigation` | One navigation action; can carry `commercialReturned`. |
| `decline` | Stops promotion; optional navigation action. |
| `unknown_product` | Refuses to invent an offer. |
| `clarify` | Asks what the visitor means. |
| `handoff` | Advising contact CTA. |

Key rules:

- At most one offer per reply.
- The model may not choose a route, price or CTA.
- `offers.ts` is the single catalogue; `commercial.ts` contains direct replies with hard-coded prices/terms.
- `getVerifiedOfferCta` validates every CTA against internal/external allowlists.
- `normalizePreviousOfferId` reads the last assistant `offerId` from browser history.
- `derivePierrotCommercialState` reads `commercialMarker` from history and trusted events.
- `selectProactivePierrotOffer` scores `POSTCARD_TERMS`, `UNFRAMED_TERMS`, `JOURNAL_TERMS`; requires page engagement or a clear signal; suppresses declined/purchased/objected offers; limits introductions to 3; blocks a different offer immediately after the previous one.

### E.3 Offer catalogue

| Offer | Route | CTA | Runtime verification |
|---|---|---|---|
| `heart_angel_postcard` | `/heartandangel/card` | `/heartandangel/card#order` | `postcards` table price/availability. |
| `journal_flow` | `/journal` | `/journal#subscribe` | `subscribers.isActive` by user id; terms “free or paid” explicitly unknown. |
| `art_engine` | `/art-engine` | `/art-engine` | Access request only; no public price. |
| `advising` | `/advising` | `https://wa.me/16467270865` | Inquiry only; no public price. |
| `unframed` | `/unframed` | `/unframed` | Retailer listings are catalogue prices, not live quotes; private reader has separate Stripe checkout. |

### E.4 Service inquiry

- Only `service_inquiry` and not `accessRequest`.
- Deterministic parsing of need, stage, timeline.
- Qualification requires `needType` and `stage`; max 3 questions.
- Writes `art_service_leads` and events.
- Contact details are written only after the user submits the existing contact form.
- Live data: 2 leads, both `new`, `need_type=consultation`, `stage` missing, no contact email.

### E.5 Commercial architecture gaps

1. **Subscription conversion is broken** by the `subscribers` / `subscriber_tokens` schema mismatch.
2. **Commercial analytics are optimistic:** events are recorded before DeepSeek succeeds.
3. **Direct replies duplicate the catalogue:** postcard price appears both in `offers.ts` and `postcardPublicPrice`/strings; UNFRAMED retailer prices are hard-coded in `commercial.ts`.
4. **Client history is trusted for commercial state:** a visitor can forge `commercialMarker` or `offerId` in the request history to suppress or introduce offers for themselves. This is not a payment-security issue, but it makes analytics and personalization tamperable.
5. **No post-purchase state from `postcard_orders` for the current conversation** except the `order_paid` event; the dashboard’s confirmed-postcard count is not scoped to Pierrot attribution.
6. **`unframed` checkout trusts the request `Origin`** when building Stripe success/cancel URLs.
7. **Offer facts are not versioned or sourced at runtime**; changing a page price requires a code change in multiple places.

---

## F. Current analytics events and payloads

### F.1 Event catalogue

Client events (`PIERROT_CLIENT_EVENTS`), sanitized by `sanitizePierrotEventPayload`:

| Event | Emitter | Sanitized payload |
|---|---|---|
| `navigation_proposed` | `PierrotContext` after a section proposal | `{ section_id }` |
| `navigation_completed` | `PierrotContext` after navigation | `{ section_id }` |
| `action_clicked` | `PierrotConversation` action button | `{ action_kind, section_id?, label_length? }` |
| `offer_action_clicked` | CTA click | `{ offer_id, cta_kind, destination }` — destination must equal the canonical verified CTA |
| `subscribe_cta_clicked` | Journal CTA click | `{ offer_id: 'journal_flow' }` |
| `conversation_ended` | new chat / close / page hide | `{ reason: 'new_chat' \| 'user_closed' \| 'page_hidden' }` |

Server events (`PIERROT_SERVER_EVENTS`):

| Event | Emitter | Payload |
|---|---|---|
| `conversation_started` | web route, Telegram events route | `{ start_page, language, has_referrer }` |
| `message_sent` | web route | `{ message_id, length, language }` |
| `assistant_replied` | web route | `{ message_id, in_reply_to, provider, length, latency_ms }` |
| `assistant_failed` | web route | `{ message_id, code: 'ai_unavailable' }` |
| `intent_classified` | `commercialAnalytics.ts` | `{ intent, confidence, uncertain, offer_id, topic, access_request, publisher_intent, declined, stage }` |
| `offer_selected` | `commercialAnalytics.ts` | `{ offer_id, intent, stage, proactive, reason }` |
| `offer_viewed` | `commercialAnalytics.ts` | `{ offer_id, intent, confidence, stage, proactive }` |
| `cta_shown` | `commercialAnalytics.ts` | `{ offer_id, cta_kind, destination, purpose, stage, proactive }` |
| `commercial_declined` | `commercialAnalytics.ts` | `{ intent, offer_id }` |
| `commercial_returned` | `commercialAnalytics.ts` | `{ from_offer_id, section_id }` |
| `order_paid` | `lib/postcards/paymentConfirmation.ts` | `{ order_id, offer_id: 'heart_angel_postcard', amount_total, currency }` |
| `checkout_started` | postcard order / UNFRAMED checkout | `{ offer_id, order_id?, amount_total, currency }` |
| `service_inquiry_started` | `serviceInquiryStore.ts` | `{ lead_id, source }` |
| `service_need_selected` | `serviceInquiryStore.ts` | `{ lead_id, need_type }` |
| `service_inquiry_qualified` | `serviceInquiryStore.ts` | `{ lead_id, need_type, stage, has_timeline }` |
| `service_contact_consent` | advising inquiries route | `{ lead_id, need_type }` |
| `service_inquiry_submitted` | advising inquiries route | `{ lead_id, need_type, has_timeline }` |
| `service_inquiry_received` | advising inquiries route | `{ lead_id, notified }` |
| `unframed_request_submitted` | UNFRAMED Telegram route | `{ offer_id: 'unframed', source: 'publisher_form' }` |
| `unframed_purchase_confirmed` | Stripe webhook / verify route | `{ offer_id: 'unframed', amount_total, currency }` |

`subscription_events` (separate table):

| Event | Payload |
|---|---|
| `subscription_submitted` | `{ status: 'already_confirmed' }` or empty |
| `subscription_confirmed` | `{ locale }` |
| `subscription_failed` | `{ reason: 'lookup' \| 'insert' \| 'update' \| 'token' \| 'email_not_configured' \| 'email_send' }` |
| `unsubscribe` | not currently emitted by the audited routes |

### F.2 Payload/privacy rules

- Client payloads are allow-listed per event; arbitrary objects are rejected.
- No message text, prompts, emails, prices, statuses or outcomes can be supplied by the browser through `/api/pierrot/events`.
- Server payloads never include message text or PII.
- Transcript content is stored only when consent is `granted`.
- Metadata events are stored unless consent is explicitly `denied`; `pending` still stores metadata.
- The admin export redacts email addresses, phone numbers and secret-like strings.

### F.3 Live event counts

| Event | Count |
|---|---:|
| `conversation_started` | 67 |
| `action_clicked` | 60 |
| `assistant_replied` | 58 |
| `message_sent` | 58 |
| `navigation_proposed` | 47 |
| `navigation_completed` | 46 |
| `intent_classified` | 45 |
| `conversation_ended` | 45 |
| `offer_viewed` | 8 |
| `cta_shown` | 5 |
| `offer_selected` | 2 |
| `offer_action_clicked` | 2 |

`subscription_events`: 51 rows, all `subscription_failed` with `reason=lookup`.

### F.4 Analytics defects

1. **Conversion events are recorded before generation.** If DeepSeek fails, `offer_selected` / `offer_viewed` / `cta_shown` remain.
2. **`subscription_confirmed` cannot occur** until the subscription schema is fixed.
3. **Postcard confirmed-purchase funnel is not attribution-scoped.** `confirmedPostcardOrders` counts all paid orders in the period, not only orders linked to a Pierrot conversation.
4. **`offer_viewed` is used as a CTA-shown proxy** in `buildPierrotSnapshot` (`if event_name === 'offer_viewed' || 'cta_shown'`), conflating two stages.
5. **No Brain retrieval event.** RAG outcome/latency/chunk count exists only in `console.info`, not in analytics.
6. **Event contract duplication.** TypeScript arrays and the SQL `CHECK`/`pierrot_record_event` body must be synchronized manually; past migrations already drifted.

---

## G. Security issues and authorization risks

### G.1 Critical / high

| ID | Severity | Finding | Evidence | Impact | Required fix |
|---|---|---|---|---|---|
| G-1 | **Critical** | `app/api/admin/items/[id]/publish/route.ts` has **no auth check** and uses `createClient({ useServiceRole: true })` for GET/PATCH. | Route exports GET/PATCH with no `requireAdmin*`; service-role client. | Anyone who knows an item id can read/modify/publish/archive/private any item. | Add `requireAdminFromRequest(req)` at the start of every exported handler; return 401/403; add tests. |
| G-2 | **High** | `app/api/admin/parse-url/route.ts` has no auth and fetches an arbitrary URL, then falls back to ScrapingAnt. | POST handler has no auth; direct `fetch(url)` and ScrapingAnt request. | SSRF/abuse of paid scraping key; internal network probing; resource abuse. | Require admin auth; reuse `assertSafePublicUrl` from `lib/knowledge/brain/url.ts`; reject private IPs; cap size/time. |
| G-3 | **High** | Advising lead endpoints authorize by `leadId` only. | `GET/POST /api/advising/inquiries` accepts `lead`/`leadId`; no session or signed token. | Anyone with a leaked lead id can read qualification data and overwrite contact email/name on a qualified lead. | Add a signed, expiring lead token or require the conversation session; do not authorize by UUID alone. |
| G-4 | **High** | Subscription flow is functionally broken and silently records failures. | `subscribers` lacks `confirmedAt`/`unsubscribedAt`; `subscriber_tokens` lacks `expires_at`/`usedAt`; 51 `subscription_failed` rows with `reason=lookup`. | Journal/Flow offer cannot convert; analytics misleading; users see errors. | Apply schema reconciliation migration or change code to the actual columns; backfill; add integration test. |
| G-5 | **High** | Telegram webhook secret enforcement is opt-in. | `app/api/pierrot/route.ts` only passes `secretToken` when `TELEGRAM_WEBHOOK_ENFORCE_SECRET === '1'`. | If unset, anyone who knows the webhook URL can post forged updates. | Enforce secret by default; require `TELEGRAM_WEBHOOK_SECRET`; fail closed in production. |

### G.2 Medium

| ID | Finding | Impact | Fix |
|---|---|---|---|
| G-6 | In-memory rate limiter (`lib/rateLimit.ts`) is per process, and `getClientIp` trusts the first `x-forwarded-for` value. | Limits are ineffective across Vercel instances and spoofable. | Use a durable store (Upstash/Postgres) and a trusted platform IP header; test spoofing. |
| G-7 | Client consent defaults to `granted`. | Conversations/messages are stored until the visitor explicitly opts out; `pending` stores metadata. | Default to `pending`; store transcript only on explicit `granted`; make the notice/choice explicit; consider a consent version bump. |
| G-8 | 90-day retention is defined but no purge job is scheduled. | Data outlives the stated policy. | Schedule `purge_expired_pierrot_conversations()` via cron; monitor. |
| G-9 | Owner RAG ignores `PIERROT_RAG_ENABLED` because `/api/pierrot-web` passes `enabled: true`. | The documented kill switch does not stop embedding/DB calls. | Use an explicit `PIERROT_BRAIN_ENABLED` (default true for owner) or honor `PIERROT_RAG_ENABLED`; document the choice. |
| G-10 | `x-admin-key` fallback in `/api/pierrot-web` uses non-constant-time comparison and accepts `ADMIN_SECRET_KEY` / `PIERO_API_SECRET`. | A leaked shared secret grants owner persona (not RAG). | Use `safeEqual`; separate secrets by purpose; remove the fallback if possible. |
| G-11 | Service-role modules lack `import 'server-only'`. | Accidental client import could bundle server code or expose credentials. | Add `server-only` to `lib/pierrot/serverStore.ts`, `lib/knowledge/brain/store.ts`, `lib/knowledge/rag/supabaseStore.ts`, `lib/knowledge/adminAuth.ts`. |
| G-12 | `knowledge_search_unframed` accepts `p_access_class` as a caller parameter and is `SECURITY DEFINER`. | If grants are ever broadened, a caller could request `owner` content. Currently only service_role can execute. | Keep grants closed; add an integration test; consider separate owner/public functions or a role assertion. |
| G-13 | `assertSafePublicUrl` resolves DNS then fetches by hostname; DNS can rebind between check and fetch. | SSRF bypass in a narrow race. | Pin the resolved IP for the connection (custom undici dispatcher/Agent) or re-check the connected peer; add tests. |
| G-14 | `/api/unframed/checkout` trusts the request `Origin` for Stripe `success_url`/`cancel_url`. | An attacker can cause a post-payment redirect to their domain. | Allow only `NEXT_PUBLIC_APP_URL` / an explicit allowlist; ignore arbitrary Origin. |
| G-15 | `authorizeKnowledgeAdmin` GitHub fallback accepts any GitHub token whose login equals the repo owner; the unframed endpoint has a separate inline GitHub-only implementation. | Inconsistent admin surface; owner token is a broad credential. | Consolidate on `authorizeKnowledgeAdmin`; document token scope; add audit logging. |

### G.3 Low / hygiene

| ID | Finding | Fix |
|---|---|---|
| G-16 | Brain and UNFRAMED admin routes have no per-admin rate limit; each `next` call can make a paid embedding request. | Add per-actor quotas and a batch cap. |
| G-17 | `brain_ingestion_jobs.document_id`, `art_service_leads.conversation_id`, `subscription_events.conversation_id` lack FKs. | Add `NOT VALID` FKs, validate after cleanup. |
| G-18 | `brain_ingestion_jobs` uniqueness is per run; two runs can queue the same URL. | Add a partial unique index for active jobs or an advisory lock in the create-run path. |
| G-19 | Stale `running` runs are not reconciled automatically. | Add run heartbeat/stale detection and a cron finalizer. |
| G-20 | No structured alerting for `assistant_failed`, `weak_match`, stale runs or subscription failures. | Add metrics/alerts; do not log content. |

### G.4 Verified-safe controls

- RLS is enabled on all reviewed private tables.
- `anon` and `authenticated` have no table grants.
- Search/claim/write RPCs are service-role-only.
- Owner RAG excludes `x-admin-key`, `x-admin-secret` and `system-admin`.
- Browser event payloads are allow-listed; no message text can be injected.
- Conversation replay/history/event writes are session-checked.
- CTA destinations are verified against static allowlists.
- Stripe purchase events are written only from trusted webhook/verify paths, not from the browser.
- Admin transcript export redacts PII.
- No secret values were printed during this audit.

---

## H. Implementation plan for Tasks 1–8

> The repository does not contain a numbered “Task 1–8” specification. To make the plan actionable, the eight workstreams below map one-to-one to the audit objectives. If your task list uses different numbers, map by objective rather than by number.

### Task 1 — Canonical schema and migration reconciliation

**Goal:** one consistent, validated data model for both ingestion pipelines and their dependent tables.

**Exact files to change**
- Add a **new** migration (do not edit applied migrations): `migrations/2026-10-31_brain_schema_reconciliation.sql` (proposed name).
- `lib/knowledge/rag/types.ts` — add optional `documentTitle`, `sourceType`, `sourceUrl` to search/evidence types when Task 3 lands.
- `lib/knowledge/rag/supabaseStore.ts` — keep the `ingestion_version` fallback during rollout.
- `lib/knowledge/brain/store.ts` — align inserts with the reconciled schema.
- `lib/pierrot/__tests__/migration.test.ts` — extend migration assertions.

**Existing functions to reuse**
- `isMissingIngestionVersionColumn`
- `upsertKnowledgeDocument`
- `createBrainStore`
- `createSupabaseKnowledgeRepository`

**New functions required**
- `backfillIngestionVersion()` — SQL-only, inside the migration.
- `validateBrainSchema()` — a read-only diagnostic in `lib/knowledge/brain/store.ts` or the existing admin Brain route.
- No new TypeScript module is required.

**Database migrations required**
1. Backfill `knowledge_documents.ingestion_version` from `metadata->>'ingestion_version'` for `NULL` rows; then set a default and consider `NOT NULL` after verification. Live evidence: manuscript row is `NULL` but metadata has `unframed-rag-ingestion-v1`.
2. Add FK `brain_ingestion_jobs.document_id → knowledge_documents(id) ON DELETE SET NULL`; add an index. Preflight orphan rows first.
3. Add FK `art_service_leads.conversation_id → pierrot_conversations(id) ON DELETE CASCADE` (or `SET NULL` if leads must survive deletion). Currently deletion is manual in the admin route.
4. Add FK `subscription_events.conversation_id → pierrot_conversations(id) ON DELETE SET NULL`.
5. Add a partial unique index for active Brain jobs, e.g. `UNIQUE (normalized_url) WHERE status IN ('queued','processing')`, after cleaning duplicates.
6. Add `subscribers.confirmedAt`, `subscribers.unsubscribedAt`, `subscriber_tokens.expires_at`, `subscriber_tokens.usedAt` **or** change the application to the actual columns. Prefer the migration because 21 tokens and 22 subscribers already exist.
7. Add a checked `source_type` constraint (`manuscript`, `article`, with an explicit extension path) only after all rows comply.
8. Optionally add an HNSW index on `knowledge_chunks.embedding` using `vector_cosine_ops`; do this only after measuring exact-scan latency at the expected corpus size.

**Potential regressions**
- FK validation can fail on orphan `document_id` / `conversation_id` rows; use `NOT VALID`, clean, then `VALIDATE CONSTRAINT`.
- A global active-job unique index can fail if duplicate active URLs already exist; run a duplicate query first.
- `NOT NULL` on `ingestion_version` can fail if any non-manuscript row is missing it.
- Adding `subscribers` columns can affect Prisma/Supabase generated types and admin pages.

**Tests required**
- `lib/pierrot/__tests__/migration.test.ts`: assert RLS, grants, FKs and event constraint.
- `lib/knowledge/rag/__tests__/rag.test.ts`: ingestion-version fallback and repository upsert behavior.
- New SQL smoke test/CI command: query `information_schema` and `pg_constraint` for the expected objects.
- Data-quality query: zero orphan FKs, zero active duplicate URLs, zero `NULL` ingestion versions after backfill.

---

### Task 2 — Durable Brain ingestion worker

**Goal:** ingestion must continue without an open browser and must not leave runs `running` forever.

**Exact files to change**
- `lib/knowledge/brain/process.ts` — batch processing, stale-run finalization, heartbeat.
- `lib/knowledge/brain/store.ts` — stale chunk cleanup, run discovery/heartbeat, atomic duplicate protection.
- `app/api/admin/brain/runs/route.ts` — create-run race protection and clearer response.
- `app/api/admin/brain/runs/[id]/next/route.ts` — keep as manual one-job endpoint.
- `app/api/admin/brain/runs/[id]/pause/route.ts`, `resume/route.ts`, `retry/route.ts` — correct status reporting and stale-run recovery.
- `app/admin/brain/BrainIngestionClient.tsx` — treat the UI as an observer/fallback, not the only worker.
- New cron handler under `app/api/cron/` (proposed, following `app/api/cron/newsletter-worker/route.ts`), e.g. `app/api/cron/brain-worker/route.ts`.
- `vercel.json` — add a cron schedule at a safe cadence (proposed).

**Existing functions to reuse**
- `processNextBrainJob`
- `computeBrainProgress`
- `claimNextJob`
- `reclaimStaleJobs`
- `resetFailedJobs`
- `findActiveJobsByUrls`
- `fetchHtmlSafely`
- `extractArticle`
- `chunkArticle`
- `createOpenRouterEmbeddingClientFromEnv`

**New functions required**
- `processBrainBatch({ runId, store, embeddingClient, limit })` in `lib/knowledge/brain/process.ts`.
- `listRunnableRuns(limit)` and `markRunHeartbeat(runId)` in `lib/knowledge/brain/store.ts` (reuse `updated_at`).
- `deleteArticleChunksExcept(documentId, keepIds)` in `lib/knowledge/brain/store.ts`.
- `finalizeStaleRuns(staleSeconds)` in `lib/knowledge/brain/process.ts` or the cron handler.

**Database migrations required**
- The active-job unique index from Task 1.
- Optional `last_progress_at` if `updated_at` is judged insufficient; prefer reusing `updated_at` to avoid a new column.
- No new event table needed.

**Potential regressions**
- Cron and the admin UI may process concurrently; `FOR UPDATE SKIP LOCKED` prevents double-claim, but both may update the run. Make run updates idempotent.
- Longer cron batches can approach the 300 s limit; cap by time and job count.
- Stale-run finalization must not change `paused` or `cancelled` runs.
- Stale chunk deletion must not delete chunks while a concurrent reader is retrieving; use a transaction or delete-after-upsert.

**Tests required**
- Extend `lib/knowledge/brain/__tests__/process.test.ts`:
  - retryable failure → `queued` with `retry_after`;
  - exhausted attempts → `failed`;
  - stale `processing` job → reclaimed;
  - paused run → no processing;
  - re-ingestion with fewer chunks → stale chunks deleted;
  - duplicate URL across runs → no second active job.
- New route test for the cron handler: secret enforcement, batch cap, run finalization.
- Query test: after cron, no run remains `running` with zero queued/processing jobs.

---

### Task 3 — Whole-Brain retrieval quality and source grounding

**Goal:** retrieve the right passages from 77+ heterogeneous documents, label them correctly, and give the model enough evidence without flooding it.

**Exact files to change**
- `lib/knowledge/rag/retrieval.ts` — configurable top-K, threshold, diversity, optional document scope.
- `lib/knowledge/rag/config.ts` — add Brain-specific constants and a feature flag.
- `lib/knowledge/rag/types.ts` — add `documentTitle`, `sourceType`, `sourceUrl`.
- `lib/knowledge/rag/supabaseStore.ts` — parse the new RPC columns.
- `lib/knowledge/rag/pierrotContext.ts` — source-aware evidence prompt.
- `lib/knowledge/rag/evidence.ts` — include document title/source in browser excerpts.
- `app/api/pierrot-web/route.ts` — honor the flag; pass optional document scope.
- `components/pierrot/PierrotConversation.tsx` — display document title/source.
- `components/pierrot/PierrotContext.tsx` — send an optional validated document scope.
- New migration (proposed) to replace `knowledge_search_unframed` with added return columns.
- Extend `lib/knowledge/evaluation/*` only if a whole-Brain evaluation fixture is added.

**Existing functions to reuse**
- `retrieveUnframedEvidence`
- `createSupabaseKnowledgeSearch`
- `toPgVector`
- `buildUnframedEvidencePrompt`
- `buildUnframedEvidenceSources`
- `parseSearchRows`
- `resolveUnframedRagThreshold`

**New functions required**
- `resolveBrainRagConfig()` in `lib/knowledge/rag/config.ts` (or extend `resolveUnframedRagThreshold`).
- `selectDiverseHits(hits, maxPerDocument)` in `lib/knowledge/rag/retrieval.ts`.
- `buildBrainEvidencePrompt()` in `lib/knowledge/rag/pierrotContext.ts`; keep `buildUnframedEvidencePrompt` as a compatibility alias.
- Optional `isBrainRagEnabled()` in `lib/knowledge/rag/config.ts`.

**Database migrations required**
- Replace `knowledge_search_unframed` return columns:
  - `document_title text`
  - `source_type text`
  - `source_url text`
  - optionally `published_at timestamptz`, `language text`.
- Keep the same input signature to avoid breaking callers.
- If hybrid retrieval is approved, add:
  - `knowledge_chunks.search_vector tsvector` (generated or trigger-maintained),
  - GIN index,
  - a combined SQL function or a second RPC for lexical ranking.
- Optional HNSW index on `embedding` after measuring.

**Potential regressions**
- Adding return columns changes PostgREST schema cache; run `NOTIFY pgrst, 'reload schema'` or wait for refresh.
- Raising top-K increases prompt size/cost; cap with the 8,000-char budget and a token estimate.
- Source-aware prompts can change answer style and citation behavior; gate behind a flag and evaluate.
- Per-document diversity may reduce recall on questions whose answer is concentrated in one long article; measure.
- A separate Brain threshold may make manuscript answers stricter or looser; keep manuscript and Brain thresholds independent.

**Tests required**
- Extend `lib/knowledge/rag/__tests__/rag.test.ts`:
  - document title/source are returned and rendered;
  - duplicate document hits are limited by `maxPerDocument`;
  - top-K > 5 is honored after the RPC cap change;
  - threshold boundary (`weak_match` vs `relevant_results`);
  - flag off → `disabled`;
  - missing `documentTitle` in legacy rows does not crash.
- Add a retrieval fixture with multiple domains and a long article to prove diversity.
- Add a SQL test for the RPC return shape and access-class filtering.
- Re-run the C4 evaluation and add a whole-Brain fixture; do not claim quality without held-out numbers.

---

### Task 4 — Owner Brain authorization and UX

**Goal:** one owner-auth path, no flag ambiguity, and an owner UI that makes the whole-Brain scope and sources explicit.

**Exact files to change**
- `lib/knowledge/adminAuth.ts` — single source of knowledge-admin authorization.
- `app/api/admin/knowledge/unframed-run/route.ts` — replace inline GitHub-only `authorize()` with `authorizeKnowledgeAdmin`.
- All `app/api/admin/brain/**/route.ts` — keep `authorizeKnowledgeAdmin`; add per-actor rate limits.
- `lib/serverAuth.ts` — keep `requireAdminFromRequest` as the credential verifier; avoid duplicate role reads where possible.
- `app/api/pierrot-web/route.ts` — use the explicit Brain flag; keep `ragOwnerAuthorized` independent of `isAdmin`.
- `lib/knowledge/rag/authorization.ts` — keep the `system-admin` exclusion; add tests for every credential type.
- `components/pierrot/PierrotContext.tsx` and `PierrotConversation.tsx` — show scope/source and optional document filter.

**Existing functions to reuse**
- `authorizeKnowledgeAdmin`
- `requireAdminFromRequest`
- `getCurrentUser`
- `isVerifiedOwnerUser`
- `isVerifiedOwnerCredential`
- `isBrainActivationPhrase`
- `getBrainExampleQuestions`

**New functions required**
- `isBrainRagEnabled(env)` in `lib/knowledge/rag/config.ts` (if a separate owner flag is chosen).
- `assertOwnerDocumentId(documentId)` in `lib/knowledge/rag/authorization.ts` or `retrieval.ts` — verify the requested document belongs to the owner scope.
- `recordBrainAccess` is optional; if added, use structured logs, not message content.

**Database migrations required**
- None for auth. Optional: a read-only audit table for owner knowledge operations, but this is not necessary for the upgrade.

**Potential regressions**
- Replacing the GitHub-only `authorize()` with `authorizeKnowledgeAdmin` could change which credentials can run the manuscript endpoint; preserve the GitHub owner path explicitly.
- Enforcing `TELEGRAM_WEBHOOK_ENFORCE_SECRET` requires re-registering the Telegram webhook with `secret_token`.
- Adding a document filter changes retrieval behavior; default must remain whole Brain.

**Tests required**
- Extend `lib/knowledge/rag/__tests__/rag.test.ts` for:
  - `system-admin` cannot owner-retrieve;
  - `x-admin-key` cannot owner-retrieve;
  - real `ADMIN` can;
  - Telegram allowlisted admin can;
  - missing ID cannot.
- Route tests for `/api/admin/knowledge/unframed-run`:
  - GitHub owner accepted;
  - real admin session accepted;
  - anonymous rejected;
  - system-admin rejected for owner-only actions if that is the policy.
- UI test: Brain button only appears for authorized sessions; mode sends `unframed`; evidence shows document title.

---

### Task 5 — Intent classification

**Goal:** improve recall on multilingual, ambiguous and owner technical questions without letting a model choose commercial facts.

**Exact files to change**
- `lib/pierrot/intents.ts` — keep the rule fast path; add normalization and optional model fallback.
- `app/api/pierrot-web/route.ts` — call the fallback only when the rule result is uncertain/unknown.
- `lib/pierrot/__tests__/intents.test.ts` — expand the golden set.
- `lib/pierrot/commercial.ts` / `strategy.ts` — only if the merge changes topic/offer semantics.

**Existing functions to reuse**
- `classifyPierrotIntent`
- `scorePierrotOfferInterest`
- `hasPierrotPageEngagementSignal`
- `isServiceLeadIntent`
- `normalizePreviousOfferId`
- `detectPierrotLanguage`

**New functions required**
- `normalizeIntentText(message)` in `lib/pierrot/intents.ts` — Unicode, ё/е, punctuation, whitespace.
- `classifyPierrotIntentWithModel({ message, ruleResult, language, timeoutMs })` — optionally in a new `lib/pierrot/intentModel.ts` (proposed) or appended to `intents.ts`.
- `mergePierrotIntent(ruleResult, modelResult)` — never allow the model to set a price or CTA; only intent/topic/confidence.
- Optional `intentConfidenceBucket()` for analytics.

**Database migrations required**
- None. If analytics needs a `classifier` field, it fits inside the existing `payload` JSON; no schema change.

**Potential regressions**
- Extra model latency/cost on every ambiguous message; use a strict timeout and fall back to rules.
- Model misclassification can change offer selection; keep the deterministic planner as the final authority.
- Prompt injection through the user message into the classifier; use a schema-constrained output and no tool access.
- Russian/English mixed messages may flip language detection; test.

**Tests required**
- Golden intent set covering:
  - navigation vs general question;
  - offer information vs purchase;
  - price objection vs price;
  - publisher vs reader;
  - refusal vs “no” in another context;
  - service inquiry vs Art Engine access;
  - owner technical question.
- Test model timeout/error → rule result preserved.
- Test model cannot invent an offer id/price.
- Add a confusion-matrix report for en/ru/mixed.

---

### Task 6 — Commercial offers and conversion paths

**Goal:** make the offers that Pierrot recommends actually convertible, and remove duplicated commercial facts.

**Exact files to change**
- `app/api/subscribe/route.ts` — use columns that exist after reconciliation; handle missing columns gracefully.
- `app/api/newsletter-confirm/route.ts` — same.
- `lib/newsletter/subscriptionEvents.ts` — keep best-effort, but surface failures to logs/metrics.
- `lib/pierrot/offerAvailability.ts` — read subscription state from the reconciled `subscribers` columns.
- `lib/pierrot/commercial.ts` — remove duplicated prices/terms; render from `PIERROT_OFFERS` facts and localized templates.
- `lib/pierrot/offers.ts` — keep as the single source of truth; add explicit “unknown” markers for unverified retailer prices.
- `app/api/unframed/checkout/route.ts` — validate `Origin` against `NEXT_PUBLIC_APP_URL`; ignore arbitrary Origin.
- `components/journal/SubscribeFormClient.tsx`, `app/flow/join/FlowJoinClient.tsx` — surface the real error and preserve attribution.
- `app/api/postcards/order/route.ts`, `lib/postcards/paymentConfirmation.ts` — keep trusted event writes; add reconciliation checks.

**Existing functions to reuse**
- `recordSubscriptionEvent`
- `recordPierrotEventByConversationId`
- `loadPierrotOfferRuntime`
- `planPierrotResponse`
- `getVerifiedOfferCta`
- `normalizePierrotSubscriptionRef`
- `pierrotConversationIdFromSubscriptionRef`
- `normalizePierrotPostcardRef`
- `pierrotConversationIdFromRef`

**New functions required**
- `getSubscriberConfirmationState(store, email)` in `app/api/subscribe/route.ts` or a shared newsletter helper — centralize column mapping.
- `recordSubscriptionFailure(store, reason)` — already implicit; make it observable.
- `renderOfferFacts(offer, language)` in `lib/pierrot/commercial.ts` — replace hard-coded price strings.
- `assertAllowedCheckoutOrigin(origin)` in `app/api/unframed/checkout/route.ts`.

**Database migrations required**
- `subscribers.confirmedAt timestamptz`, `subscribers.unsubscribedAt timestamptz` (or rename code to `created_at`/`isActive`; choose one).
- `subscriber_tokens.expires_at timestamptz`, `subscriber_tokens.usedAt timestamptz` (or use existing `used` + `created_at`).
- Backfill:
  - `confirmedAt = createdAt` where `isActive = true` and `confirmedAt IS NULL`;
  - `expires_at = created_at + interval '7 days'` for existing tokens;
  - do not activate pending subscribers.
- Index `subscriber_tokens(expires_at)`.
- Optional FK `subscription_events.conversation_id`.

**Potential regressions**
- Backfilling `confirmedAt` can change who is considered subscribed; only backfill active rows.
- Adding `NOT NULL` can fail on legacy rows; backfill first.
- Changing hard-coded copy changes model prompts and tests; update snapshots.
- Enforcing checkout origin may break local development; allow `localhost` only in non-production.

**Tests required**
- Route tests for `/api/subscribe`:
  - new email → pending token;
  - existing active email → `already_confirmed`;
  - missing columns → explicit 503, not a generic 500;
  - attribution `psub_...` stored.
- Route tests for `/api/newsletter-confirm`:
  - valid token activates subscriber;
  - expired token → 410;
  - used token → 404;
  - writes `subscription_confirmed`.
- `lib/pierrot/__tests__/commercial.test.ts`: all offer facts come from `offers.ts`; no duplicated price constants.
- Checkout origin allowlist test.
- Live smoke: one test subscriber can complete the full confirm flow.

---

### Task 7 — Analytics and event contract

**Goal:** make funnel numbers trustworthy and add Brain retrieval observability without storing content.

**Exact files to change**
- `lib/pierrot/commercialAnalytics.ts` — record after successful generation, or add explicit “aborted” handling.
- `app/api/pierrot-web/route.ts` — move `recordPierrotCommercialAnalytics` to the success path; record RAG metrics.
- `lib/pierrot/conversation.ts` — add any new event names to the TypeScript contract.
- New migration (proposed) — extend `pierrot_events` constraint and `pierrot_record_event` once, generated from the TypeScript list.
- `lib/analytics/pierrotIntelligence.ts` — fix `offer_viewed`/`cta_shown` conflation and attribution-scoped purchase counts.
- `app/admin/pierrot/page.tsx` — surface new Brain retrieval metrics if added.
- `lib/pierrot/__tests__/migration.test.ts` — assert event-list parity.

**Existing functions to reuse**
- `recordPierrotCommercialAnalytics`
- `recordPierrotEvent`
- `recordPierrotEventByConversationId`
- `sanitizePierrotEventPayload`
- `isPierrotEventName`
- `buildPierrotSnapshot`
- `loadPierrotDashboard`

**New functions required**
- `recordBrainRetrieval(store, { conversationId, sessionId, userMessageId, outcome, chunkCount, latencyMs, topSimilarity, code })` in `lib/pierrot/commercialAnalytics.ts` or a new `lib/pierrot/brainAnalytics.ts`.
- `recordCommercialAnalyticsAfterReply(...)` — or move the existing call after `appendPierrotMessage`.
- `eventContractParity()` — a test helper or script that compares `PIERROT_EVENT_NAMES` with the live `pg_constraint`.
- `countAttributedPostcardOrders()` in `lib/analytics/pierrotIntelligence.ts` — scope confirmed purchases to Pierrot refs if that is the product definition.

**Database migrations required**
- Add `brain_retrieval` (and optionally `assistant_aborted`) to `pierrot_events` constraint and `pierrot_record_event`.
- No new table; payload fits the existing 4 KB limit.
- Ensure `NOT VALID`/validation strategy preserves historical rows.

**Potential regressions**
- New event names can be rejected until the migration is applied; keep analytics best-effort.
- Moving analytics after generation means a failed generation produces no funnel event; that is the intended correction, but dashboards must treat missing events as “not delivered”.
- More events increase row count; retention/purge still applies via conversation cascade.
- Changing purchase scoping can lower reported conversions; document the definition change.

**Tests required**
- `lib/pierrot/__tests__/commercialAnalytics.test.ts`: no offer events on AI failure; events on success.
- `lib/pierrot/__tests__/migration.test.ts`: TypeScript event list and SQL constraint parity.
- `lib/analytics/__tests__/pierrotIntelligence.test.ts`: funnel stage separation, confirmed purchase scoping, subscription failure visibility.
- RAG analytics test: outcome/latency/chunk count present, no query text.

---

### Task 8 — Security hardening, tests and rollout

**Goal:** close the critical authorization gaps, make limits durable, and ship the upgrade behind measurable gates.

**Exact files to change**
- `app/api/admin/items/[id]/publish/route.ts` — add `requireAdminFromRequest`.
- `app/api/admin/parse-url/route.ts` — add auth and reuse `assertSafePublicUrl`.
- `app/api/advising/inquiries/route.ts` — require a signed lead token or conversation session.
- `lib/rateLimit.ts` — durable store + trusted client IP.
- `app/api/pierrot/route.ts` — enforce webhook secret by default.
- `lib/pierrot/serverStore.ts`, `lib/knowledge/brain/store.ts`, `lib/knowledge/rag/supabaseStore.ts`, `lib/knowledge/adminAuth.ts` — add `import 'server-only'`.
- `app/api/unframed/checkout/route.ts` — origin allowlist.
- `middleware.ts`, `app/admin/layout.tsx` — keep admin page gated by `requireAdmin`.
- `vercel.json` — cron entries for Brain worker and retention purge.
- `docs/audits/*` — update the audit/runbook with the final architecture.

**Existing functions to reuse**
- `requireAdminFromRequest`
- `authorizeKnowledgeAdmin`
- `assertSafePublicUrl`
- `checkRateLimit`
- `getClientIp`
- `purge_expired_pierrot_conversations`
- `processNextBrainJob`

**New functions required**
- `getTrustedClientIp(request)` in `lib/rateLimit.ts`.
- `checkRateLimitDurable(identifier, options)` in `lib/rateLimit.ts` (or a new provider adapter).
- `requireLeadAccess(request, leadId)` in `lib/pierrot/serviceInquiryStore.ts` or the advising route.
- `assertProductionWebhookSecret()` in `app/api/pierrot/route.ts` startup.
- `enforceServerOnly()` is not a function; use the `server-only` package import.

**Database migrations required**
- Optional durable rate-limit table if not using an external store.
- No other schema change required for security.
- Apply Task 1/6 migrations before enabling subscription or Brain cron.

**Potential regressions**
- Adding auth to the items route can break any admin UI that currently calls it without credentials; verify the caller and add tests.
- Enforcing Telegram webhook secret requires re-registering the webhook.
- Durable rate limiting adds a dependency/latency; provide a fail-open or fail-closed policy explicitly.
- Signed lead tokens require a new token in the contact link; existing open links must be migrated or expire.
- `server-only` imports can break tests that import server modules in a browser-like Jest environment; configure Jest per test.

**Tests required**
- Security regression tests for every route above: anonymous → 401/403, admin → allowed.
- SSRF tests for `parse-url`: private IP, localhost, redirect to private IP, oversized response.
- Rate-limit tests: spoofed `x-forwarded-for`, cross-instance behavior (or documented limitation).
- Webhook tests: missing secret → rejected in production; valid secret → accepted.
- Lead-access tests: no token → 403; valid token → read/submit; expired token → 403.
- RLS/grant introspection test: `anon`/`authenticated` have no table privileges and no policies.
- Full `npx tsc --noEmit` and targeted Jest suites before rollout.

---

## I. Duplicated functionality and architectural inconsistencies

| Area | Duplication / inconsistency | Consequence | Recommendation |
|---|---|---|---|
| Ingestion | UNFRAMED manuscript parser/chunker vs Brain article parser/chunker | Two version contracts, two ID schemes, two failure models. | Keep both, but formalize a shared `KnowledgeSource` interface and one admin surface. |
| Admin auth | `authorizeKnowledgeAdmin` (Brain) vs inline GitHub-only `authorize` (UNFRAMED) | Different credentials can operate different knowledge endpoints. | Use `authorizeKnowledgeAdmin` everywhere; keep GitHub owner as an explicit fallback. |
| Supabase clients | `createPierrotStore`, `createBrainStore`, `getServerSupabaseClient({useServiceRole})`, `createSupabaseKnowledgeRepository` | Four service-role construction paths. | Add one server-only factory in `lib/serverAuth.ts` or a new server-only module; reuse. |
| Role lookup | `getCurrentUser` reads `users`; `requireAdminFromRequest` reads it again; auth-trigger route uses `user_roles` | Inconsistent admin model. | Standardize on `users.role` for admin, or document `user_roles` as the canonical source. |
| Event contract | `PIERROT_EVENT_NAMES` in TS vs `pierrot_events_event_name_check` and `pierrot_record_event` in SQL | Manual sync; past out-of-order migrations already broke it. | Generate the SQL list from TS or add a parity test/CI check. |
| Commercial copy | `offers.ts` facts vs hard-coded replies in `commercial.ts` | Price/term drift; two sources of truth. | Render direct replies from catalogue facts and localized templates. |
| Analytics | `commercialAnalytics.ts` vs `pierrotIntelligence.ts` | Event semantics are split between writer and reader. | Define a single event schema document and test both sides. |
| Brain scope | UI says “Brain”, prompt says “UNFRAMED”, evidence source is always `UNFRAMED` | Misleading citations; owner cannot tell which article supports an answer. | Add title/source metadata end-to-end. |
| URL pre-analysis | `/api/admin/brain/analyze` and `/api/admin/brain/runs` duplicate URL normalization/dedupe | Divergent behavior; race conditions. | Extract shared `analyzeBrainUrls()` into `lib/knowledge/brain/url.ts` or `store.ts`. |
| Document counts | `unframed-run` assumes total `documentCount === 1`; Brain adds articles | Manuscript verify/ingest blocked. | Change checks to document-scoped counts, not table-wide counts. |
| Subscription schema | Code uses `confirmedAt`/`unsubscribedAt`/`expires_at`/`usedAt`; live tables do not have them | Subscription flow fails at lookup. | Reconcile schema or code; add integration test. |
| RAG flag | `PIERROT_RAG_ENABLED` documented as kill switch; owner route passes `enabled: true` | Flag has no effect on owner Brain. | Add a real owner flag and wire it consistently. |
| Event status | `offer_selected`/`offer_viewed`/`cta_shown` written before model success | Inflated funnels. | Write after success or add explicit aborted state. |

---

## J. Test and verification baseline

### J.1 Commands run during the audit

```bash
npx jest lib/knowledge lib/pierrot app/api/pierrot-web app/api/pierrot app/api/admin/pierrot --runInBand --silent
# 29 suites passed, 279 tests passed

npx tsc --noEmit
# exit 0, no errors
```

### J.2 Existing coverage

- RAG config, embeddings, ingestion plan/apply, retrieval outcomes, evidence prompt, owner auth.
- Brain URL normalization, extraction, chunking, process worker, duplicate and partial cases.
- Pierrot intents, commercial planning, proactive strategy, offers, conversation limits, attribution, telemetry, migration security.
- Admin Pierrot routes and export.
- Analytics aggregation and load-error handling.

### J.3 Important coverage gaps

1. No live-database integration test for `knowledge_search_unframed` return shape or access-class filters.
2. No test for `documentCount === 1` regression in `unframed-run`.
3. No test that the actual `subscribers` / `subscriber_tokens` columns match the code.
4. No test that `PIERROT_EVENT_NAMES` equals the live SQL constraint.
5. No test for the unauthenticated admin items/publish route or parse-url route.
6. No test for Telegram webhook secret enforcement.
7. No end-to-end owner Brain test with real embeddings and real DB.
8. No stale-run/cron test.
9. No test for source-aware evidence (because the feature does not exist yet).
10. No test for `unframed/checkout` origin validation.

---

## K. Recommended implementation order

```text
1. Freeze/observe ingestion and take a stable DB snapshot.
2. Task 1  — schema reconciliation + FKs + active-job uniqueness.
3. Task 6  — fix subscription schema (unblocks journal_flow and analytics).
4. Task 8  — close critical auth/SSRF/rate-limit issues before adding load.
5. Task 2  — durable worker + stale-run recovery + article chunk cleanup.
6. Task 3  — source-aware whole-Brain retrieval + diversity + threshold.
7. Task 4  — one admin auth path + owner UX.
8. Task 5  — intent fallback and evaluation.
9. Task 7  — analytics correctness + Brain retrieval metrics.
10. Re-run C4/whole-Brain evaluation, shadow test, owner pilot, then public rollout.
```

**Rollout gates**

- No `running` run without a worker for more than the agreed interval.
- Subscription flow completes end-to-end for a test address.
- `npx tsc --noEmit` clean; targeted Jest suites green.
- Owner RAG returns source titles and passes access-control tests.
- No critical admin route is unauthenticated.
- `anon` / `authenticated` database access remains closed.
- A held-out whole-Brain retrieval evaluation exists before claiming quality.

---

## L. Bottom line

The Brain and Pierrot code is more mature than a prototype: it has a real offer catalogue, deterministic commercial control, owner identity separation, session-checked persistence, RLS, and a substantial test suite. The main risks are not “missing AI”; they are **operational and consistency risks**: a browser-driven ingestion queue, a whole-Brain search that cannot name its sources, a broken subscription schema, analytics written before success, and inconsistent admin authorization. Fix those before expanding the model’s autonomy.
