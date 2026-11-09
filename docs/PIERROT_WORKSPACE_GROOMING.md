# Pierrot Workspace Grooming & Integrity Engine

Date: 2026-11-26

## 1. Audit summary

Existing systems reused:

- conversations/messages: `pierrot_conversations`, `pierrot_messages`;
- projects: `pierrot_projects`, canonical `conversation_id`,
  `pierrot_project_conversations`;
- tasks/decisions/memory: `pierrot_decisions`, `pierrot_decision_events`,
  `pierrot_project_decisions`;
- materials/knowledge: `pierrot_project_artifacts`, `pierrot_project_knowledge`;
- Dev tasks and GitHub: `pierrot_dev_prompts`, existing Octokit client in
  `lib/pierrot/dev/repository.ts` and write client in `lib/pierrot/dev/write.ts`;
- GitHub write confirmations: prepared `pierrot_github_operations`;
- conversation summary columns: `summary`, `summary_generated_at`;
- existing project review service for explicit “review this project” commands.

Production schema was checked directly. No duplicate task, memory, project or
GitHub client was created.

## 2. New coordination layer

`lib/pierrot/grooming/`:

- `commands.ts` — audit scopes and approval language;
- `collect.ts` — bounded read-only snapshot of the workspace;
- `rules.ts` — proposal generation from existing tasks, memory, projects,
  conversations and GitHub evidence;
- `github.ts` — task ↔ Issue/PR reconciliation using the existing GitHub client;
- `health.ts` — project/workspace health derived from real records;
- `store.ts` — audit, proposals, execution journal and GitHub links;
- `execute.ts` — revalidated, idempotent execution of approved operations;
- `context.ts` — versioned conversation summaries over untouched messages;
- `format.ts` — compact chat reports;
- `service.ts` — orchestration.

## 3. Workflow

1. Owner writes “Наведи порядок” or a scoped variant.
2. Pierrot collects data and writes an audit plan only. No task, memory,
   project, conversation or GitHub write happens.
3. The chat renders a compact report and an approval card.
4. Owner can approve all, safe/reversible only, selected numbers, or reject all.
5. Execution re-reads each entity. Changed entities become `stale` and are not
   touched.
6. Every operation is written to `pierrot_workspace_operations` with
   before/after state and source references.
7. Report contains actual executed/skipped/failed/stale counts.

Supported commands include:

- Наведи порядок / Наведи тут порядок
- Наведи порядок в диалогах / проектах
- Проверь задачи
- Почисти контекст
- Сверься с GitHub

Project-specific “наведи порядок в проекте X” remains the existing project
review command.

## 4. GitHub rules

- Closed Issue alone is `needs_verification`, not done.
- Duplicate Issue is `needs_verification`.
- Merged PR plus a matching closed Issue can be `confirmed_done`.
- Merged PR with a broader task is `partially_implemented`.
- Closed unmerged PR is not completion.
- Commit alone is not completion.
- API failure is `sync_error`.
- Missing Issue is `not_found`; archival is never proposed only because GitHub
  404’d. A relink to a plausible alternative can be proposed after approval.
- New Issues are proposed only for concrete engineering tasks with a real
  configured repository mapping. Ideas, research, editorial plans, purchases and
  ambiguous discussions are excluded.
- Writes still require the existing `PIERROT_DEV_WRITE_ENABLED` flag and GitHub
  token permission.

## 5. Context compression

- Original `pierrot_messages` are immutable sources.
- Each summary is a new row in `pierrot_context_summaries` with version,
  message index range, message count, previous version and generation time.
- `pierrot_conversations.summary` keeps the latest summary for fast loading.
- Summaries are generated deterministically from messages, linked decisions,
  tasks, facts, open questions and recent changes.
- Automatic refresh happens when the real conversation volume crosses
  `24 000` characters or `36` messages and the summary is older than 14 days.
- Automatic compression never changes tasks, Brain, projects or GitHub.

## 6. Health

`GET /api/admin/pierrot/workspace-health` computes project health from real
records and the latest audit proposals. It is manual/on-demand in the UI and can
be called by an existing scheduler later. No new worker or automatic write loop
is introduced.

States:

- `healthy` — no detected issues;
- `attention` — stale tasks, duplicates, stale summary, unlinked tasks;
- `blocked` — GitHub sync errors or unresolved/contradictory decisions.

## 7. Migration

Prepared only:

- `migrations/2026-11-26_pierrot_workspace_grooming.sql`
- `migrations/rollback/2026-11-26_pierrot_workspace_grooming.rollback.sql`

Tables:

- `pierrot_workspace_audits` — prepared/approved/executed audit plan;
- `pierrot_workspace_proposals` — concrete operations and approval state;
- `pierrot_workspace_operations` — append-only execution journal;
- `pierrot_context_summaries` — versioned summaries;
- `pierrot_github_task_links` — local task ↔ Issue/PR links.

Apply manually after review. Until applied, grooming commands return a clear
`migration_required` message and do not change anything.

## 8. Safety boundaries

- First command never changes workspace data.
- Every write requires explicit approval.
- No physical deletion of messages, tasks, memory or decisions.
- Archival uses status/archived reason and remains recoverable.
- No automatic GitHub writes without the existing write flag and confirmation.
- No new project or project chat is created by grooming.
- Stale plans do not execute.
- Repeated execution does not duplicate operations.
- Partial failure preserves successful operations and reports failures honestly.
- Data from messages and external sources is treated as data, not instructions.

## 9. Tests

`lib/pierrot/grooming/__tests__/` covers command parsing, approval modes,
duplicate tasks, cross-project tasks, GitHub status rules, duplicate Issues,
merged PR scope, API failure, missing Issue, temporary facts, misclassified rules,
command artifacts, context summaries, stale plans, partial failures, repeated
execution, rejected proposals and project health.
