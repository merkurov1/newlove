# Task 7 — Brain Knowledge Graph & Editorial Radar

**Status:** implemented on top of the existing Brain RAG layer. Vector search is unchanged.

## What was added

### Entity and relationship extraction

- Entities: people, organizations, publications, countries, cities, technologies, artworks, art projects, events, concepts and recurring themes.
- Relationships: `authored_by`, `published_in`, `mentions`, `discusses`, `related_to`, `created_by`, `part_of`, `occurred_in`, `contradicts`, `develops`, `references`.
- Every entity mention stores its `document_id` and `chunk_id`.
- Every relationship stores its provenance document, provenance chunk, evidence quote, confidence and `inference` flag.
- Relationships are model hypotheses until the owner verifies them. The UI marks inferred edges as dashed and labels them as hypotheses.

### Thematic summaries

`brain_thematic_summaries` supports four scopes:

- `document` — each indexed article and the manuscript.
- `chapter` — sections of the UNFRAMED manuscript.
- `project` — UNFRAMED, Novaya Gazeta columns, personal columns, Heart & Angel.
- `theme` — recurring concepts with at least two source documents.

Summaries store their source document IDs, entity IDs, confidence, model and extractor version.

### Owner research interface

`/admin/brain/research` answers questions using:

1. hybrid Brain retrieval over the existing chunks;
2. graph entities and relationships matched from the question;
3. thematic summaries;
4. coverage statistics for questions about gaps or under-explored topics.

Answers include document titles, headings, section paths, chunk IDs and similarity scores. Inferred relationships are separated from explicit evidence.

### Editorial radar

`/admin/brain/radar` analyses recent visitor questions from `pierrot_messages`:

- removes duplicates and personal data;
- embeds questions with the existing `baai/bge-m3` pipeline;
- clusters similar questions;
- checks whether existing documents answer them;
- proposes topics and content ideas with related documents;
- stores suggestions as `pending`, `approved` or `dismissed`.

Approval only changes the suggestion status. Nothing is published or edited automatically.

## Database tables

Migration: `migrations/2026-10-31_create_brain_knowledge_graph.sql`

- `brain_graph_runs`
- `brain_graph_jobs`
- `brain_document_extractions`
- `brain_entities`
- `brain_entity_mentions`
- `brain_relationships`
- `brain_document_topics`
- `brain_thematic_summaries`
- `brain_radar_runs`
- `brain_editorial_suggestions`

All tables have RLS enabled and are revoked from `PUBLIC`, `anon` and `authenticated`. Only `service_role` can read or write them.

## Cost and performance controls

- Graph extraction runs as a durable document queue; one document per HTTP worker call.
- Documents are skipped when their content hash and extractor version are unchanged.
- Chunks are batched (up to 10 chunks / 16k characters per model call).
- Document summaries are batched (up to 6 documents per call).
- Chapter, project and theme summaries are batched.
- The vector index and embeddings are reused; no second embedding model exists.
- All runs store extractor version, model, status and error codes.

## Owner routes

- `POST /api/admin/brain/graph/runs` — create a graph extraction run.
- `POST /api/admin/brain/graph/runs/[id]/next` — process one document.
- `POST /api/admin/brain/graph/synthesize` — generate document/chapter/project/theme summaries.
- `GET /api/admin/brain/graph` — graph nodes and edges with filters.
- `POST /api/admin/brain/research` — grounded research answer with citations.
- `GET /api/admin/brain/radar` — suggestions and recent radar runs.
- `POST /api/admin/brain/radar/refresh` — rebuild the radar.
- `PATCH /api/admin/brain/radar/[id]` — approve/dismiss a suggestion.

All routes use the existing server-side owner authorization (`authorizeKnowledgeAdmin`). Client flags are never trusted.

## Acceptance check

- Graph data is extracted from actual `knowledge_documents` and `knowledge_chunks`.
- Every relationship has document and chunk provenance.
- The owner can navigate from an insight to its source document/chunk.
- Existing `knowledge_search_unframed` / `brain_search_hybrid` retrieval remains the retrieval path for Pierrot.
