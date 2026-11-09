# Pierrot integration notes

This document covers the three owner-facing additions: GitHub in chat, shared
Schema.org helpers, GA4 events and the private Food & Beverage Tracker.

## GitHub

- Read tools are implemented in `lib/pierrot/dev/repository.ts` and exposed
  through the existing `executeDevTool` in `lib/pierrot/dev/tools.ts`.
- Project contexts live in `lib/pierrot/dev/repositories.ts`:
  `heart_angel`, `art_engine`, `pierrot_backend`, `pierrot_mobile`,
  `main_platform`. A context only prioritises paths; it never creates a second
  repository.
- Owner chat uses `lib/pierrot/dev/chatBridge.ts`. Simple reads are
  deterministic; natural-language code research reuses the existing read-only
  Dev model and its tools.
- Writes are **never** available to the model. They require a stored proposal
  (`pierrot_github_operations`) plus an explicit later confirmation. The write
  module checks:
  1. an authenticated ADMIN (route already enforces this);
  2. `PIERROT_DEV_WRITE_ENABLED === 'true'`;
  3. real `push` permission on the target repository;
  4. a non-default working branch for file writes;
  5. an explicit `confirmed: true` passed only after the owner confirms.
- A write never targets the protected default branch. Pull requests use a
  working head branch and the default base branch.

## Schema.org

All entities are built in `lib/structuredData.ts` and rendered through
`components/seo/JsonLd`:

- Journal: `CollectionPage` archive, `BlogPosting` articles,
  `NewsArticle` only for an explicit `kind = news|breaking`.
- Flow: `BlogPosting` for articles and long notes, `NewsArticle` only when
  `metadata.news_type` / `metadata.schema_type` says so, `CreativeWork` for
  quotes/video, `WebPage` for links, photos and short notes.
- About and service pages: `AboutPage` / `WebPage` linked to the existing
  `Person` and `WebSite` `@id`s.
- Artworks: `VisualArtwork` for real works. Auction lots use the real artist,
  and unknown artists omit `creator` rather than attributing the work to Anton.
- Art Engine itself is a `WebPage`, not a `VisualArtwork`.

## GA4

See `docs/analytics/ga4-events.md`. One property, production-only loader,
`send_page_view: false`, one manual `page_view` per App Router pathname, and a
strict key allowlist. Dialogue text, intake records, emails, Brain data and
owner identifiers are dropped before an event is sent.

## Food & Beverage Tracker

- Parser: `lib/pierrot/intake/parser.ts` (RU/EN, deterministic).
- Optional model fallback: `lib/pierrot/intake/llm.ts`, enabled only with
  `PIERROT_INTAKE_LLM_ENABLED=true` and existing DeepSeek/OpenRouter keys.
- Storage: `lib/pierrot/intake/store.ts`, table `intake_logs`.
- Chat integration: owner-only block in `app/api/pierrot-web/route.ts`.
- Queries read `intake_logs` directly, never Brain/RAG.
- Day boundaries use `PIERROT_INTAKE_TIMEZONE`. If it is missing, UTC is used
  and the answer explicitly says the boundaries are approximate.
- Duplicate protection: unique `(user_id, source_message_id, item_index)`.
- Corrections and deletions act only on the owner's latest record and are
  reported only after the database confirms the change.

## Manual actions

1. Review and apply `migrations/2026-11-25_pierrot_intake_logs.sql`.
2. Review and apply `migrations/2026-11-25_pierrot_github_operations.sql`
   before using GitHub writes.
3. Add the new environment variables from `.env.example`.
4. For GitHub writes, the token needs Contents, Issues and Pull requests write
   permission. Keep it server-only.
5. Verify GA4 in DebugView against the live property; do not assume collection
   before that check.
