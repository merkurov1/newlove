# Pierrot project chat: audit, target model and migration

Date: 2026-11-24

## 1. Audit of the previous implementation

### Data model found

- `pierrot_projects` — owner project shell (brief, status, rating, activity).
- `pierrot_conversations` — all Pierrot chats, including owner site chats.
- `pierrot_messages` — per-conversation `message_index` sequence.
- `pierrot_events` — analytics/behaviour events tied to a conversation.
- `pierrot_project_conversations` — many-to-many project ↔ conversation links.
- `pierrot_decisions` — owner memory, decisions, tasks, reminders and notes.
- `pierrot_project_decisions` — canonical decision ↔ project relation.
- `pierrot_project_artifacts` — project materials.
- `pierrot_project_knowledge` — project ↔ Brain document links.
- `pierrot_dev_prompts` — dev tasks with an optional `project_id`.

### Problems found

1. A project could accumulate several conversations through the relation table.
   Opening a project created a new chat; refreshing or returning created another.
2. The model context mixed up to five previous project conversations instead of
   one permanent transcript.
3. The full chat history was not searched deterministically. History questions
   relied on the model guessing from a short tail.
4. The dialogue list displayed every linked historical conversation separately.
5. There was no whole-project review command and no report persistence.
6. Tasks, ideas, decisions and materials had no single project-scoped sweep.
7. `project_brief` was the only durable summary; review decisions/contradictions
   had no revision history.
8. There was no protection against two concurrent reviews of one project.

## 2. Target model implemented

- `pierrot_projects.conversation_id` is the single source of truth for the
  project's one permanent chat.
- `pierrot_project_conversations` is retained as provenance for history search
  and for the merge/rollback migration. It is not a second “main chat” selector.
- Opening a project adopts its newest legacy chat if no canonical id exists yet,
  or creates exactly one conversation. It never creates a new chat on refresh.
- The API redirects any old conversation id that belongs to a project to the
  canonical conversation before persisting messages.
- The UI collapses a project to one dialogue row with a project badge.
- Old messages load on demand through `/api/admin/pierrot/conversations`.
- Model context contains the project brief, latest review summary, decisions,
  tasks, materials, the recent canonical transcript and, for history questions,
  deterministic search results from older project messages.

## 3. Project review service

`lib/pierrot/projects/review/` implements:

1. load the project, its canonical chat, linked history, tasks, decisions and
   materials;
2. classify explicit next actions, ideas, owner decisions, materials, open
   questions and explicit completions;
3. match against existing entities and detect duplicates/contradictions;
4. apply only safe/reversible operations;
5. write the report and a revised working summary;
6. return an honest partial/failed report when a write fails.

Safety rules:

- Only owner messages can create decisions; assistant proposals never become
  owner decisions.
- Ideas are stored as `saved` memory records with an `idea` tag, never as tasks.
- `Надо обсудить…` becomes an open question, not a task.
- A task is auto-completed only when a later owner message names it
  unambiguously.
- Exact duplicate tasks are merged with `superseded_by` history. Similar but not
  exact duplicates are reported for the owner.
- Deletion and irreversible operations are never performed by the review.
- Repeating the same command message returns the stored report instead of
  creating duplicates. A DB partial unique index prevents two concurrent
  reviews of one project.

## 4. Migrations

Prepared only; not applied automatically:

- `migrations/2026-11-24_pierrot_canonical_project_chat.sql`
  - `pierrot_projects.conversation_id` + unique index;
  - safe backfill only for projects with exactly one linked chat;
  - `pierrot_project_reviews` with one-running-review protection;
  - `pierrot_project_chat_migrations` and
    `pierrot_project_chat_merge_map` backup/mapping tables.
- `migrations/rollback/2026-11-24_pierrot_canonical_project_chat.rollback.sql`

## 5. Historical merge

Dry run (default, no writes):

```bash
SUPABASE_DB_URL='postgres://…' node scripts/pierrot/project-chat-migration.mjs
```

Apply after reviewing the report:

```bash
SUPABASE_DB_URL='postgres://…' node scripts/pierrot/project-chat-migration.mjs --apply
```

Restore one applied run:

```bash
SUPABASE_DB_URL='postgres://…' node scripts/pierrot/project-chat-migration.mjs --restore-run=<run-id>
```

The script:

- keeps all conversation rows and events unchanged;
- moves messages into the canonical conversation with continuous indexes;
- keeps message ids;
- leaves exact duplicate messages in their source conversation and records the
  mapping;
- stores the full original row and original conversation/index in
  `pierrot_project_chat_merge_map`;
- is transactional per project and idempotent via the mapping table;
- reports projects with several linked chats or duplicates as requiring review.

## 6. Production checklist

1. Back up the database.
2. Apply the additive migration on staging.
3. Run the merge dry run and review warnings.
4. Apply the merge on staging; verify message counts and old-history search.
5. Repeat on production during a low-activity window.
6. Test: open a project twice, refresh, send messages, search old history, run
   «Наведи порядок в проекте» twice.
7. Keep the mapping table until the merge is accepted. Roll back with the
   restore command first, then the SQL rollback if needed.
