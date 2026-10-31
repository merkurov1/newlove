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

Existing `flow_ai_context` rows are never regenerated automatically. A public
page generates context only when no row exists, as before. The admin AI
endpoint can regenerate one item explicitly.

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
