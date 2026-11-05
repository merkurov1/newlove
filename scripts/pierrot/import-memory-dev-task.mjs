#!/usr/bin/env node
/* eslint-env node */
/**
 * One-off, idempotent owner-memory → Dev Task Studio import.
 *
 * It uses the existing Supabase tables only:
 *   - pierrot_decisions.source_refs / tags  → provenance link
 *   - pierrot_dev_prompts.decision_ids      → source memory ID
 *
 * No migration, background job or new service is required. Run with the
 * server-only Supabase credentials in the environment (or .env.production.local).
 *
 *   node scripts/pierrot/import-memory-dev-task.mjs
 *   DRY_RUN=1 node scripts/pierrot/import-memory-dev-task.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const MEMORY_ID = process.env.DEV_MEMORY_ID || '0aac6356-b6a3-418c-bf90-01f499b1cd94';
const TITLE = 'Проверить логи Dev Mode и улучшить работу';
const OBJECTIVE =
  'Исследовать реальные логи и поведение Dev Mode, выявить ошибки и узкие места, подготовить конкретные исправления.';
const REPOSITORY = 'merkurov1/newlove';
const STATUS = 'draft';
const DRY_RUN = process.env.DRY_RUN === '1';

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const fileEnv = loadEnvFile(path.resolve(process.cwd(), '.env.production.local'));
const env = { ...fileEnv, ...process.env };
const supabaseUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function rest(pathname, init = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${String(text).slice(0, 400)}`);
  }
  return payload;
}

function buildPrompt(task) {
  const lines = [
    `# ENGINEERING TASK — ${task.title}`,
    '',
    `Repository: ${task.repository}`,
    `Base ref: ${task.baseRef}`,
  ];
  if (task.baseCommit) lines.push(`Base commit: ${task.baseCommit}`);
  lines.push('', '## Goal', '', task.objective, '', '## Context', '', task.context, '');
  lines.push(
    '## Affected files and components',
    '',
    '- Not established yet. Inspect the repository before changing files.',
    ''
  );
  lines.push(
    '## Current behaviour',
    '',
    'Dev Mode behaviour must be verified from real logs and source code. Do not assume the current behaviour from this task text.',
    ''
  );
  lines.push(
    '## Required behaviour',
    '',
    'Identify concrete Dev Mode errors and bottlenecks, then implement the smallest justified fixes with evidence.',
    ''
  );
  lines.push(
    '## Technical plan',
    '',
    '1. Read the Dev Mode implementation and its internal callers.',
    '2. Reproduce or inspect real failure paths before changing code.',
    '3. Separate confirmed facts, likely findings and hypotheses.',
    '4. Make the smallest complete change and preserve existing working behaviour.',
    ''
  );
  lines.push(
    '## Tests',
    '',
    '- Add or update focused tests for every changed behaviour.',
    '- Run lint, typecheck, relevant unit tests and build where available.',
    '- Report exactly what ran and what did not run.',
    ''
  );
  lines.push(
    '## Acceptance criteria',
    '',
    '- Dev Mode errors/bottlenecks are documented from evidence, not guessed.',
    '- The fix is minimal and does not rewrite the surrounding system.',
    '- Verification output is attached; unverified items are stated explicitly.',
    ''
  );
  lines.push(
    '## Security considerations',
    '',
    '- Dev Mode remains owner-only.',
    '- GitHub access remains read-only unless a separate explicit write flow is approved.',
    '- Do not expose tokens, private memory or production data.',
    ''
  );
  lines.push('## Unverified / out of scope', '', '- Production runtime logs were not supplied in the source memory record.', '');
  lines.push(
    '## Working agreement',
    '',
    '- Inspect the actual repository before changing anything.',
    '- Do not claim a test, build or check passed unless it actually ran.',
    '- Never write directly to the default branch.',
    '- Do not add paid services, cron, workers or background indexing.',
    '',
    '## Result hand-off',
    '',
    'Return the working branch, commit SHA(s), PR URL if created, changed files, commands run with results, and any criterion that remains unverified.',
    ''
  );
  return lines.join('\n').trim();
}

async function latestCommit() {
  try {
    const response = await fetch(
      'https://api.github.com/repos/merkurov1/newlove/commits/main',
      { headers: { 'User-Agent': 'pierrot-import' } }
    );
    if (!response.ok) return null;
    const payload = await response.json();
    return typeof payload.sha === 'string' ? payload.sha : null;
  } catch {
    return null;
  }
}

const memory = (
  await rest(
    `pierrot_decisions?select=*&id=eq.${encodeURIComponent(MEMORY_ID)}`
  )
)?.[0];

if (!memory) {
  console.error(`Memory record ${MEMORY_ID} was not found. Nothing created.`);
  process.exit(1);
}
if (!memory.user_id) {
  console.error('Memory record has no owner user_id. Nothing created.');
  process.exit(1);
}

const existing = await rest(
  `pierrot_dev_prompts?select=id,title,status,decision_ids&decision_ids=cs.%7B${encodeURIComponent(
    MEMORY_ID
  )}%7D&limit=1`
);

if (Array.isArray(existing) && existing.length > 0) {
  console.log(
    JSON.stringify(
      {
        alreadyImported: true,
        taskId: existing[0].id,
        title: existing[0].title,
        status: existing[0].status,
        memoryStatus: memory.status,
      },
      null,
      2
    )
  );
  process.exit(0);
}

const baseCommit = await latestCommit();
const context = [
  `Источник: pierrot_decisions:${memory.id}`,
  `Тип записи: ${memory.kind}; исходный статус: ${memory.status}.`,
  memory.project ? `Проект: ${memory.project}.` : null,
  Array.isArray(memory.tags) && memory.tags.length > 0
    ? `Теги: ${memory.tags.join(', ')}.`
    : null,
  '',
  memory.content || memory.title,
]
  .filter((line) => line !== null)
  .join('\n');

const prompt = buildPrompt({
  title: TITLE,
  objective: OBJECTIVE,
  context,
  repository: REPOSITORY,
  baseRef: 'main',
  baseCommit,
});

const row = {
  user_id: memory.user_id,
  repository: REPOSITORY,
  base_ref: 'main',
  base_commit: baseCommit,
  task: TITLE,
  title: TITLE,
  objective: OBJECTIVE,
  context,
  current_behavior: '',
  required_behavior: '',
  technical_plan: '',
  prompt_text: prompt,
  affected_files: [],
  backend_changes: [],
  frontend_changes: [],
  database_changes: [],
  mobile_changes: [],
  migrations: [],
  tests: [],
  acceptance_criteria: [],
  security_constraints: [
    'Dev Mode is owner-only.',
    'GitHub access remains read-only unless a separate explicit write flow is approved.',
  ],
  unverified: ['Production runtime logs were not supplied in the source memory record.'],
  pull_requests: [],
  result_notes: '',
  conversation_id: memory.conversation_id || null,
  decision_ids: [MEMORY_ID],
  status: STATUS,
};

if (DRY_RUN) {
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        memoryId: MEMORY_ID,
        title: TITLE,
        repository: REPOSITORY,
        baseCommit,
        status: STATUS,
      },
      null,
      2
    )
  );
  process.exit(0);
}

const inserted = await rest('pierrot_dev_prompts?select=*', {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify(row),
});
const task = Array.isArray(inserted) ? inserted[0] : inserted;

if (!task?.id) {
  console.error('Task insert returned no row. Nothing confirmed.');
  process.exit(1);
}

const sourceRefs = Array.isArray(memory.source_refs) ? memory.source_refs : [];
const tags = Array.isArray(memory.tags) ? memory.tags : [];
const nextRefs = [
  ...sourceRefs.filter(
    (ref) => !(ref && typeof ref === 'object' && ref.type === 'dev_task')
  ),
  {
    type: 'dev_task',
    taskId: task.id,
    repository: REPOSITORY,
    status: STATUS,
    createdAt: new Date().toISOString(),
  },
].slice(-20);
const nextTags = Array.from(new Set([...tags, 'dev-task'])).slice(0, 10);
let linkPersisted = true;

try {
  await rest(`pierrot_decisions?id=eq.${encodeURIComponent(MEMORY_ID)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ source_refs: nextRefs, tags: nextTags }),
  });
} catch (error) {
  linkPersisted = false;
  console.error(`Task created, but the memory link failed: ${error.message}`);
}

try {
  await rest('pierrot_decision_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      decision_id: MEMORY_ID,
      user_id: memory.user_id,
      event_type: 'updated',
      from_status: memory.status,
      to_status: memory.status,
      metadata: {
        source: 'dev_bridge',
        reason: 'dev_task_created',
        taskId: task.id,
        repository: REPOSITORY,
      },
    }),
  });
} catch {
  // The task and provenance link are already written. The audit event is
  // best-effort and never changes the source record status.
}

const verifiedTask = (
  await rest(`pierrot_dev_prompts?select=id,title,status,decision_ids&id=eq.${task.id}`)
)?.[0];
const verifiedMemory = (
  await rest(
    `pierrot_decisions?select=id,title,status,source_refs,tags&id=eq.${encodeURIComponent(
      MEMORY_ID
    )}`
  )
)?.[0];

console.log(
  JSON.stringify(
    {
      imported: true,
      taskId: verifiedTask?.id || task.id,
      title: verifiedTask?.title || TITLE,
      status: verifiedTask?.status || STATUS,
      decisionIds: verifiedTask?.decision_ids || [MEMORY_ID],
      linkPersisted,
      memory: {
        id: verifiedMemory?.id || MEMORY_ID,
        status: verifiedMemory?.status || memory.status,
        tags: verifiedMemory?.tags || nextTags,
        hasDevTaskLink: (verifiedMemory?.source_refs || []).some(
          (ref) => ref && typeof ref === 'object' && ref.type === 'dev_task'
        ),
      },
    },
    null,
    2
  )
);
