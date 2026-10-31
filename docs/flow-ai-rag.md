# Flow AI public Brain RAG

## Scope

Flow AI context now supports public-only Brain retrieval. The result is still
stored in `flow_ai_context` and used by public Flow pages, so the retrieval
boundary is intentionally stricter than the owner Brain search.

A document can enter public Flow retrieval only when **all** of the following
are true:

1. `knowledge_documents.public_retrieval_allowed = true`;
2. `source_type` is not `manuscript` or `personal_writing`;
3. `ingestion_status = 'completed'`;
4. it belongs to the explicit allowlist passed to the public RPC;
5. it passes a second application-level verification after retrieval.

Every document remains owner-only by default. The migration does not enable any
document and does not regenerate any Flow context.

## Explicit document approval

```bash
curl -X POST https://<host>/api/admin/knowledge/documents/<document-id>/public-retrieval \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <admin session>' \
  -d '{"allowed":true,"note":"Public article approved for Flow context"}'
```

Disable with `{"allowed":false}`. Manuscripts and private columns are rejected
with `400` even if an administrator tries to approve them.

`GET` on the same endpoint returns the current public-retrieval state.

## Flow item switch

- global: `FLOW_AI_RAG_ENABLED=false` disables RAG for every item;
- per item: `items.rag_allowed = false` (admin item page checkbox) generates
  context from the item itself only.

Public pages never call the model. They read only a `ready` row from
`flow_ai_context`.

Context is generated automatically once after publication (admin PATCH or
Flow item POST) through `ensurePublishedFlowContext()`, and can also be
regenerated explicitly by an administrator:

```text
POST /api/admin/items/<item-id>/ai
Authorization: admin session, admin Bearer JWT or Telegram initData
```

The admin item page has **Generate AI context** / **Regenerate AI context**.
Each action makes one Gemini attempt and, only on failure, one DeepSeek attempt;
the OpenRouter DeepSeek fallback remains available. It then:

- writes `status = generating` before the call;
- on success writes `status = ready`, `content`, `model`, `provider`,
  `generated_at` and public-only provenance;
- on failure writes `status = error` with the error message and returns `500`;
- on a photo item returns `skipped` without calling the model.

Existing rows never block explicit regeneration: the endpoint always upserts
by `item_id`, so an administrator can refresh a stale or failed item.
Automatic post-publish generation is skipped when a row already exists. No
batch, cron or public-page trigger regenerates items.

Generation is bounded by the shared LLM timeout, token budget and circuit
breaker. Gemini is primary; DeepSeek Direct and OpenRouter DeepSeek are the
automatic fallbacks. A provider failure is thrown, persisted as `error`, and is
never reported as a successful skip. The actual provider, model, latency and
fallback flag are stored in `retrieval_diagnostics.generation`.

## Retrieval workflow

```text
FLOW ITEM
→ classify
→ Brain query plan
→ public document allowlist
→ public hybrid retrieval
→ post-verification against the current allowlist
→ evidence selection
→ AI analysis
→ flow_ai_context + source_refs
```

The retrieval RPC is `brain_search_flow_public`. It requires an explicit
document-id allowlist and has `service_role`-only execution. The application
also re-queries the allowed documents after retrieval and drops any hit whose
document is not currently allowed. This protects against a broken or stale SQL
filter.

## What is stored

`flow_ai_context` keeps:

- `model`, `provider`;
- `generation_version` (`flow-ai-v1` or `flow-ai-rag-v1`);
- `rag_enabled`, `retrieval_status`, `retrieval_method`, `retrieval_latency_ms`;
- `source_document_ids`, `source_titles`;
- `source_refs` — public document id/title, chunk id, excerpt, similarity,
  source URL, source type and publication date;
- `retrieval_diagnostics` — intent, candidate count, outcome, error reason.

Public pages select only `id,item_id,content,model,provider,status,generated_at`.
They never receive `source_refs` or retrieval diagnostics.

## Fallback

If RAG is disabled, no public document exists, retrieval returns no match, the
embedding model is unavailable, or the post-retrieval verification fails, Flow
AI uses the previous item-only pipeline. `retrieval_status` records why:
`disabled`, `no_match`, `weak_match`, `unavailable` or `error`.

## Anti-retelling

The RAG prompt treats evidence as untrusted data and asks for contextual
interpretation only: previous-material connections, thematic continuity,
recurring ideas, historical context, authorial concepts, cultural/technological
parallels and the item's place in Flow. It explicitly forbids retelling,
long quotation, bibliographies and invented sources.

## Recovery notes (2026-10-31)

The endpoint appeared to return HTTP 200 while saving nothing. Two independent
causes were found:

1. `generateFlowContext()` swallowed provider failures and returned `null`.
   The route interpreted `null` as “intentionally skipped”, deleted the row and
   returned `{ success: true, skipped: true }`.
2. The OpenRouter fallback still targeted `deepseek/deepseek-r1:free`, which
   OpenRouter no longer serves (404).
3. `readInt()` in `lib/operations/config.ts` parsed an unset variable as `''`
   → `Number('')` → `0`, then clamped it to the minimum. With no
   `OPS_FLOW_LLM_TIMEOUT_MS` configured, the Flow LLM timeout silently became
   **1 second**, which is why the direct DeepSeek request timed out. The same
   bug reduced the Flow token budget to its minimum (100 tokens) and made the
   circuit-breaker failure threshold **1** instead of 3.

Fixes:

- blank/unset limit variables now use documented defaults (`readInt` returns
  the fallback before parsing);
- provider failures now throw `FlowAIGenerationError`; the route persists
  `status = error` and returns `500`;
- the fallback list contains only the available `deepseek/deepseek-chat`;
- the admin endpoint allows draft/private items so context can be prepared
  before publishing;
- `DEEPSEEK_BASE_URL` is honoured for controlled testing and self-hosted
  OpenAI-compatible endpoints;
- the admin item page exposes the saved status, content, model, provider,
  generation time and error, with a regeneration button.

Verified end-to-end against the real Supabase project with the real route:
unauthorized `401`, first generation saved `ready`, regeneration changed
`content` and `generated_at`, a forced provider failure saved `error` and
returned `500`, recovery returned to `ready`, photo items were skipped, and a
published Flow page rendered the saved context. The successful-provider test
used an OpenAI-compatible local stub because the production DeepSeek key is a
Vercel secret that cannot be read from the sandbox.

## Runtime safety

Flow context generation passes through the shared LLM circuit breaker and
request budget (`OPS_FLOW_LLM_TIMEOUT_MS`, `OPS_FLOW_LLM_MAX_TOKENS`). If the
LLM dependency is open, generation fails honestly and the public page falls
back to item-only presentation. Public retrieval remains behind
`FLOW_AI_RAG_ENABLED` and the explicit document allowlist.

## Apply

```bash
psql "$DIRECT_URL" -f migrations/2026-11-09_flow_ai_public_rag.sql
```

The migration is additive and idempotent. It adds columns, constraints, indexes
and one RPC. It does not publish or regenerate anything.

## Tests

```bash
npx jest lib/flow lib/knowledge/rag --runInBand
npx tsc --noEmit
```

Tests cover owner-document leakage, manuscript/private-column rejection,
post-retrieval verification failure, empty allowlists, disabled RAG,
non-RAG fallback and sanitized source refs.
