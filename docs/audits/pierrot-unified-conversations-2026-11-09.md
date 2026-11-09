# Pierrot: unified conversations and project contexts

Date: 2026-11-09  
Scope: `merkurov1/newlove` web/PWA and a read-only audit of `merkurov1/Pierrot` (Expo).

## 1. State before the change

- The actual web sidebar is the drawer inside
  `components/pierrot/workspace/ChatWorkspace.tsx`; there is no
  `components/ConversationSidebar.tsx` in this repository.
- The drawer had:
  - “Новый диалог”;
  - a separate “Проекты” link;
  - one “Недавние разговоры” list.
- `sortOwnerConversations` sorted active project chats first, then paused
  project chats, then ordinary chats. That was visual grouping by project even
  without folders.
- Project badges were already rendered as metadata inside conversation rows.
- The chat header linked the project badge to a separate project page.
- `/admin/pierrot/projects` and `/admin/pierrot/projects/[slug]` rendered
  separate project-management/overview screens.
- Canonical project chats already existed:
  - `pierrot_projects.conversation_id` is the canonical pointer;
  - `ensureProjectConversation()` adopts or creates one chat;
  - `pierrot_project_conversations` remains historical provenance.
- “Наведи порядок” already existed as a deterministic project review in
  `lib/pierrot/projects/review/`. It writes into memory/tasks/decisions/artifacts
  and does not create chats.

The Expo client already had a single conversation list in
`pierrot-ios/src/components/chat/ConversationSidebar.tsx` and no project-folder
navigation. It was inspected read-only; no mobile changes were required.

## 2. What changed

### Sidebar / navigation

- Removed the “Проекты” link from the web chat drawer.
- Removed `FolderOpen` from `ChatWorkspace` imports.
- Replaced the project badge link in the chat header with a non-clickable,
  compact project label.
- Renamed the list section from “Недавние разговоры” to “Все разговоры”.
- `/admin/pierrot/projects` now redirects to `/admin/pierrot`.
- `/admin/pierrot/projects/[slug]` redirects to
  `/admin/pierrot?project=<slug>`, which opens the canonical project chat in
  the same conversation UI.
- No project filters, nested project lists or project folders remain in the
  web navigation.

### Sorting

`lib/pierrot/workspace/conversationOrdering.ts` now sorts only by activity:

```text
updatedAt DESC -> startedAt fallback -> id tie-breaker
```

`updatedAt` in the conversation list is derived from `last_message_at` when
present, otherwise `updated_at`/`started_at`. Project membership no longer
affects sort order.

`lib/pierrot/workspace/data.ts` now queries conversations ordered by
`last_message_at DESC NULLS LAST`, then `updated_at DESC`.

### Project metadata

- Project badges remain a small metadata label in conversation rows.
- Project badges do not create nesting.
- Canonical conversation filtering remains: legacy project chats stay in the DB
  and in project history search, but the user-facing list shows the project's
  canonical conversation.
- Project pages no longer exist as a separate UI.

### Project recognition

`lib/pierrot/projects/matching.ts` now derives aliases from the existing name and
slug without creating new rows:

- `Heart & Angel` → `heart & angel`, `heart&angel`, `heart and angel`,
  `heart-and-angel`, `heartandangel`, `heartangel`;
- `Art Engine` → `art engine`, `art-engine`, `artengine`;
- compact/punctuation variants are matched with Unicode boundaries.

`resolvePierrotProject`, `resolveExactProject`, `getPierrotProject` and project
creation all use the same matching logic. A spelling variant can find the
existing project but cannot create a duplicate project.

### Project context levels

- Conversation-level: `pierrot_projects.conversation_id` remains canonical;
  legacy `pierrot_project_conversations` stays provenance.
- Message-level: the current turn can infer a project with
  `resolvePierrotProject` without changing the whole conversation.
- Artifact-level: extracted memory/tasks receive the inferred project in
  `pierrot_project_decisions` and `pierrot_decisions.project` mirror, plus
  `projectId`/`projectSlug` in `source_refs`.
- An ordinary conversation can discuss more than one project; it is not
  forcibly converted into a project chat.
- Unclear context does not assign a random project.

### Review / “Навести порядок”

The existing deterministic review was preserved and audited:

- does not create chats;
- does not create projects;
- writes tasks/decisions/ideas/materials to existing stores;
- uses `project_id` links for project records;
- has idempotency by request message and duplicate checks;
- requires explicit owner evidence for completions;
- preserves report history in `pierrot_project_reviews`;
- stores `projectSlug` in the report for traceability.

GitHub Issues are not created automatically by the review. The existing owner
GitHub chat path remains the only write path and requires a stored proposal plus
explicit confirmation on a later turn.

### Unified search

Added:

- `lib/pierrot/search/intent.ts` — pure detection of owner-wide search requests;
- `lib/pierrot/search/unified.ts` — server-side search across:
  - owner conversations/messages;
  - memory tasks/decisions/notes;
  - project artifacts;
  - project knowledge;
  - Brain chunks/documents;
  - optionally GitHub Issues;
- `lib/pierrot/search/format.ts` — source-labelled compact report.

Examples supported:

- «Найди всё, что мы обсуждали по Heart & Angel»;
- «Где мы обсуждали новую структуру Sidebar?»;
- «Какие задачи остались по Art Engine?»;
- «Покажи последние решения по Pierrot»;
- «Найди заметку о проекте Unframed»;
- «Найди GitHub issues по Art Engine».

Results include source type, project badge, short excerpt and a link to the
conversation/project. Full transcripts are not copied into the answer.

Search is owner-only and never returns another user's conversations.

## 3. Data and migrations

No new schema changes were required by this task.

Existing canonical/review migration:

- `migrations/2026-11-24_pierrot_canonical_project_chat.sql`
  (`conversation_id`, `pierrot_project_reviews`, merge mapping).

Existing additive migrations relevant to this area:

- `migrations/2026-11-23_pierrot_owner_ratings.sql`;
- `migrations/2026-11-22_pierrot_project_links_backfill.sql`.

Read-only production check during this work:

- `pierrot_projects.conversation_id` exists;
- `pierrot_project_reviews` exists;
- `owner_rating` exists in projects and decisions;
- `pierrot_project_chat_migrations` and `..._merge_map` exist;
- `pierrot_project_decisions` has rows.

No migration was applied by this task. No deployment or commit to the production
branch was performed.

## 4. Tests

Added/updated:

- `lib/pierrot/workspace/__tests__/conversationOrdering.test.ts`
  — one chronological stream, projects do not jump ahead.
- `lib/pierrot/projects/__tests__/resolver.test.ts`
  — compact/punctuation aliases and no duplicate project creation.
- `lib/pierrot/projects/__tests__/commands.test.ts`
  — review command scoped to explicit “в проекте <name>”.
- `lib/pierrot/search/__tests__/intent.test.ts`
  — unified search detection and report formatting.
- `lib/pierrot/search/__tests__/unified.test.ts`
  — owner-only conversation search, project badge, no cross-owner leak.
- `app/api/pierrot-web/__tests__/route.test.ts`
  — Octokit test isolation for the existing GitHub chat bridge.

Final checks:

```text
TypeScript: tsc --noEmit -> 0 errors
Jest:       290 suites, 2004 tests passed
Build:      not run (requested to skip)
```

## 5. Remaining limitations

- The legacy project-chat merge is prepared but should still be applied with the
  existing reviewed script before relying on one physically merged transcript.
  Until then, legacy project chats remain in the database and are searchable
  through project history, while the list shows the canonical conversation.
- GitHub Issues are not created by the project review automatically; the owner
  must use the existing GitHub chat write flow and confirm the proposal.
- Search is deterministic lexical/project-scoped. It does not call an LLM to
  guess a project or invent a source.
- Mobile has no project-folder navigation to remove; its existing status widget
  is not a project manager. No mobile code was changed.
- The repo contains unrelated in-progress work outside this task; it was not
  committed or overwritten.
