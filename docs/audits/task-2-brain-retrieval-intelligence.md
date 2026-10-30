# Task 2 — Brain Retrieval Intelligence

**Status:** implemented locally. The old vector-only retrieval remains available. No production data was changed by this task.

## 1. What changed

### Source-aware query routing

Added `lib/knowledge/rag/queryRouting.ts`.

`buildBrainQueryPlan()` is a lightweight, side-effect-free classifier. It identifies:

- language;
- intent (`document_lookup`, `thematic_overview`, `source_lookup`, `biography`, `project`, `general`);
- requested source classes;
- requested domains;
- requested authors;
- explicit year/relative time ranges;
- whether the user wants a thematic overview;
- whether the question targets a specific document.

Supported source classes:

| Class              | Derivation from existing data                                                   |
| ------------------ | ------------------------------------------------------------------------------- |
| `manuscript`       | `knowledge_documents.source_type = 'manuscript'`                                |
| `article`          | `source_type = 'article'` and a `novayagazeta.ru` / `novayagazeta.eu` domain    |
| `personal_writing` | `source_type = 'article'` and `substack.com`, or author `Anton Merkurov`        |
| `art_project`      | `source_type = 'art_project'`, a Heart & Angel domain, or a Heart & Angel title |
| `biography`        | `source_type = 'biography'` or explicit query intent                            |
| `research`         | `source_type = 'research'` or explicit query intent                             |
| `other`            | any future/unclassified source                                                  |

No new storage field was required. Future documents can also set `metadata.knowledge_class` or `source_type` to one of the supported classes.

Examples implemented:

- **“What have I written in Novaya Gazeta about AI?”**
  - source class `article`
  - domains `novayagazeta.ru`, `novayagazeta.eu`
  - lexical query `ai`
  - intent `thematic_overview`
- **“What does UNFRAMED say about autonomy?”**
  - source class `manuscript`
  - lexical query `autonomy`
  - intent `document_lookup`
- **“Explain Heart & Angel.”**
  - source class `art_project`
  - no fallback to manuscript
- **“What personal essays describe my Soviet past?”**
  - source classes `personal_writing` / `biography`
- **“What did I write about in 2024?”**
  - explicit year range
  - thematic overview

### Hybrid retrieval

Added an additive SQL function:

```text
public.brain_search_hybrid(...)
```

It combines:

- BGE-M3 cosine similarity (`1 - embedding <=> query_embedding`);
- Postgres full-text rank using the language-neutral `simple` configuration;
- source type/domain/author/language/document filters;
- publication date filters;
- completed-document and access-class checks.

The migration also adds:

- GIN full-text index on chunk heading + content;
- lower(author) index;
- publication-date index.

Added `lib/knowledge/rag/brainRetrieval.ts`:

- embeds the query with the existing `baai/bge-m3` contract;
- calls `brain_search_hybrid`;
- applies deterministic ranking and diversity:
  - `0.75 * vector similarity + 0.17 * lexical score + 0.05 * source priority + 0.03 * author match`;
  - maximum 2 chunks per document for general queries;
  - maximum 4 chunks per document for an explicit document query;
  - maximum 1 manuscript chunk in a mixed/general query;
  - top-K 8, candidate pool 40.
- filters the returned rows again in TypeScript as a defence-in-depth check against source leakage;
- returns the existing `RagRetrievalResult` shape plus a trace object.

The old `retrieveUnframedEvidence()` implementation is untouched. The route selects v2 by default and can switch back with:

```text
PIERROT_BRAIN_RETRIEVAL_V2=false
```

### Ranking and thresholds

- New default threshold: `BRAIN_RAG_MIN_SIMILARITY=0.32` (provisional).
- Explicit source/document questions use 80% of the threshold, because the selected corpus is already narrow.
- Lexical matches with a positive full-text score can qualify even when vector similarity is weak.
- Existing BGE-M3 embeddings and the existing `knowledge_chunks.embedding` column are preserved.

### Grounding prompt

`lib/knowledge/rag/pierrotContext.ts` now:

- labels each evidence block with `source`, `document_title`, `source_type`, `source_domain`, `author` and `published_at`;
- distinguishes:
  - UNFRAMED manuscript,
  - published Novaya Gazeta article,
  - personal Substack writing,
  - project material,
  - biography/research;
- instructs Pierrot not to call personal writing a published article;
- instructs Pierrot not to invent publication dates, editors, links, titles, page numbers or quotations;
- requires an explicit “insufficient evidence” answer when the retrieved passages do not establish the claim;
- tells Pierrot to separate documented facts from interpretation.

`lib/knowledge/rag/evidence.ts` and the Pierrot source list now expose document title, domain, source class and publication date to the owner UI.

### Observability

Added `lib/pierrot/brainAnalytics.ts`.

Each owner Brain query writes one `brain_retrieval` event to the private `pierrot_events` table:

```json
{
  "query_hash": "16 hex chars",
  "language": "en",
  "intent": "thematic_overview",
  "subject_chars": 2,
  "requested_sources": ["article"],
  "selected_sources": ["article"],
  "requested_domains": ["novayagazeta.ru"],
  "time_from": null,
  "time_to": null,
  "method": "hybrid_v2",
  "outcome": "relevant_results",
  "empty": false,
  "top_similarity": 0.71,
  "candidate_count": 12,
  "document_ids": ["..."],
  "chunk_ids": ["..."],
  "ranking": [
    {
      "document_id": "...",
      "chunk_id": "...",
      "source_class": "article",
      "similarity": 0.71,
      "lexical_score": 0.2,
      "combined_score": 0.66
    }
  ],
  "used_context": true,
  "generation_ok": true
}
```

It never stores the query text, retrieved passage text, names, emails or publication content. It is written only for owner Brain requests, with the existing conversation/session ownership check. It is not exposed through a public GET endpoint.

If generation fails after retrieval, the event is still recorded with `generation_ok=false`.

### Evaluation

Added:

- `lib/knowledge/evaluation/brain/questions.ts` — 21 real-document questions across:
  - Novaya Gazeta
  - UNFRAMED
  - Heart & Angel (currently no corpus materials, so expected no-answer)
  - biography
  - personal writing
  - multi-source
  - no-answer
- `lib/knowledge/evaluation/brain/evaluate.ts` — document-level Recall@5, Precision@5, source-selection accuracy, retrieval failure rate, false-accept rate, by-category breakdown, and old-vs-new comparison.
- `lib/knowledge/evaluation/brain/__tests__/brainEvaluation.test.ts` — metric and comparison tests.
- `lib/knowledge/rag/__tests__/brainRetrieval.test.ts` — source routing, manuscript/article separation, diversity, no-answer, weak-match and observability tests.
- `scripts/knowledge/brain-retrieval-eval.ts` — live benchmark runner for real documents and real BGE-M3 query embeddings.

The live benchmark requires:

1. the two Task 2 migrations applied;
2. a usable `OPENROUTER_API_KEY`;
3. `DATABASE_URL`.

The benchmark script was not executed in this environment because the configured OpenRouter key is a placeholder. No quality claim is made from an unrun benchmark. The old implementation remains available for a side-by-side run.

A routing-only preflight over the current corpus confirmed that all 19 source-specific questions had their expected documents inside the selected source filters. The two general no-answer questions intentionally leave the corpus open and rely on the similarity/lexical threshold plus the no-answer evaluator.

### Migrations

Apply in order:

1. `migrations/2026-10-30_brain_hybrid_retrieval.sql`
2. `migrations/2026-10-30_add_brain_retrieval_event.sql`
3. `migrations/2026-10-30_backfill_novaya_publication_dates.sql`

The first adds the additive hybrid RPC and indexes; it does not modify or drop `knowledge_search_unframed()`. The second adds the `brain_retrieval` event name and replaces the event writer with the same contract. The third fills `published_at` for existing Novaya rows only when the canonical URL contains a real `/YYYY/MM/DD/` date; it never overwrites values and never invents dates for other domains.

## 2. Acceptance mapping

| Requirement                                                                  | Implementation                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| “What do I write about in Novaya Gazeta?” retrieves articles, not manuscript | Query plan selects `article` and Novaya domains; SQL + JS filter exclude manuscripts. |
| “What does UNFRAMED say about autonomy?” prioritizes manuscript              | Query plan selects `manuscript`; SQL + JS filter exclude articles.                    |
| Preserve BGE-M3 and DB compatibility                                         | Same model, dimensions, table and vector column; new RPC is additive.                 |
| Source-aware retrieval                                                       | `queryRouting.ts` + `brain_search_hybrid` + TypeScript re-filtering.                  |
| Hybrid retrieval                                                             | Vector + `ts_rank_cd` full-text + source/date filters + diversity.                    |
| Reranking                                                                    | Deterministic weighted ranking; no model reranker.                                    |
| Observability                                                                | Private `brain_retrieval` event with IDs/scores/outcome; no query or passage text.    |
| Grounding                                                                    | Source-aware evidence JSON and instructions.                                          |
| Evaluation                                                                   | Real-document fixture, metrics, comparison harness and benchmark script.              |
| Old implementation retained                                                  | `retrieveUnframedEvidence()` and `knowledge_search_unframed()` remain.                |

## 3. Known limitations

- Source classes for existing documents are derived from `source_type`, domain, author and title. Future sources should set `source_type` or `metadata.knowledge_class` explicitly.
- Heart & Angel has no documents in the current corpus; the correct current behavior is a refusal/no-match, not a manuscript fallback.
- Novaya publication dates are `NULL` for older documents until they are re-imported through Task 1’s date recovery. Year filters therefore depend on a refreshed corpus.
- Postgres `simple` full-text is language-neutral but not morphological; BGE-M3 remains the primary multilingual signal.
- No cross-encoder reranker is enabled because no benchmark has demonstrated a meaningful improvement.
- The evaluation fixture uses real document ids from the current snapshot; document ids are deterministic from canonical URLs, but the fixture must be reviewed if the corpus is intentionally re-keyed.
