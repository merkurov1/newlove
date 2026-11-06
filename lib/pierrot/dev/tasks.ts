import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { resolveDevRepository } from './repositories';
import { getPierrotProject } from '@/lib/pierrot/projects/store';
import type {
  DevTask,
  DevTaskInput,
  DevTaskStatus,
  DevVerificationStatus,
  DevReviewReport,
} from './types';

assertServerOnly('lib/pierrot/dev/tasks');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT = 20_000;
const MAX_ARRAY_ITEMS = 60;
const MAX_ARRAY_ITEM = 2_000;

export const DEV_TASK_STATUSES: DevTaskStatus[] = [
  'draft',
  'ready',
  'in_progress',
  'review',
  'verified',
  'rejected',
  'archived',
];

export const DEV_VERIFICATION_STATUSES: DevVerificationStatus[] = [
  'verified',
  'verified_with_warnings',
  'not_verified',
  'rejected',
];

function isUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_PATTERN.test(value));
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT) : fallback;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, MAX_ARRAY_ITEM))
    .filter(Boolean)
    .slice(0, MAX_ARRAY_ITEMS);
}

function status(value: unknown, fallback: DevTaskStatus = 'draft'): DevTaskStatus {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return DEV_TASK_STATUSES.includes(normalized as DevTaskStatus)
    ? (normalized as DevTaskStatus)
    : fallback;
}

function verificationStatus(value: unknown): DevVerificationStatus | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'passed') return 'verified';
  if (normalized === 'partial') return 'verified_with_warnings';
  if (normalized === 'not_run') return 'not_verified';
  if (normalized === 'failed') return 'rejected';
  return DEV_VERIFICATION_STATUSES.includes(normalized as DevVerificationStatus)
    ? (normalized as DevVerificationStatus)
    : null;
}

function storedVerificationStatus(value: DevVerificationStatus | null): string | null {
  if (value === 'verified') return 'passed';
  if (value === 'verified_with_warnings') return 'partial';
  if (value === 'not_verified') return 'not_run';
  if (value === 'rejected') return 'failed';
  return value;
}

function missingColumn(error: unknown): boolean {
  const textValue =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /PGRST204|42703/.test(textValue);
}

function missingTable(error: unknown): boolean {
  const textValue =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /PGRST205|42P01|relation .* does not exist/i.test(textValue);
}

function mapRow(row: Record<string, unknown>): DevTask {
  const repository = String(row.repository || 'merkurov1/newlove');
  const repositoryKey = repository.toLowerCase().includes('pierrot') ? 'pierrot' : 'newlove';

  return {
    id: String(row.id || ''),
    userId: typeof row.user_id === 'string' ? row.user_id : null,
    title: text(row.title || row.task, 'Без названия'),
    objective: text(row.objective),
    context: text(row.context),
    repository: repositoryKey,
    baseRef: text(row.base_ref, 'main'),
    baseCommit: typeof row.base_commit === 'string' ? row.base_commit : null,
    affectedFiles: list(row.affected_files),
    currentBehavior: text(row.current_behavior),
    requiredBehavior: text(row.required_behavior),
    technicalPlan: text(row.technical_plan),
    backendChanges: list(row.backend_changes),
    frontendChanges: list(row.frontend_changes),
    databaseChanges: list(row.database_changes),
    mobileChanges: list(row.mobile_changes),
    migrations: list(row.migrations),
    securityConstraints: list(row.security_constraints),
    tests: list(row.tests),
    acceptanceCriteria: list(row.acceptance_criteria),
    unverified: list(row.unverified),
    conversationId: typeof row.conversation_id === 'string' ? row.conversation_id : null,
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    decisionIds: list(row.decision_ids),
    status: status(row.status),
    verificationStatus: verificationStatus(row.verification_status),
    verificationNotes: text(row.verification_notes),
    pullRequests: list(row.pull_requests),
    resultCommit: typeof row.result_commit === 'string' ? row.result_commit : null,
    resultNotes: text(row.result_notes),
    verifiedAt: typeof row.verified_at === 'string' ? row.verified_at : null,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    promptText: text(row.prompt_text),
  };
}

export function buildTaskPrompt(task: DevTask): string {
  const lines: string[] = [];
  const add = (heading: string, value?: string | null) => {
    if (!value || !value.trim()) return;
    lines.push(`## ${heading}`, '', value.trim(), '');
  };
  const addList = (heading: string, values?: string[]) => {
    if (!values || values.length === 0) return;
    lines.push(`## ${heading}`, '', ...values.map((value) => `- ${value}`), '');
  };

  lines.push(`# ENGINEERING TASK — ${task.title}`, '');
  lines.push(`Repository: ${task.repository}`, `Base ref: ${task.baseRef}`);
  if (task.baseCommit) lines.push(`Base commit: ${task.baseCommit}`);
  lines.push('');

  add('Goal', task.objective);
  add('Context', task.context);
  addList('Affected files and components', task.affectedFiles);
  add('Current behaviour', task.currentBehavior);
  add('Required behaviour', task.requiredBehavior);
  add('Technical plan', task.technicalPlan);
  addList('Backend changes', task.backendChanges);
  addList('Frontend changes', task.frontendChanges);
  addList('Database changes', task.databaseChanges);
  addList('Mobile changes', task.mobileChanges);
  addList('Migrations', task.migrations);
  addList('Security considerations', task.securityConstraints);
  addList('Tests', task.tests);
  addList('Acceptance criteria', task.acceptanceCriteria);
  addList('Unverified / out of scope', task.unverified);

  lines.push('## Working agreement', '');
  lines.push(
    '- Inspect the actual repository before changing anything. Do not assume this task is complete because a file or commit exists.',
    '- Preserve existing public URLs, database compatibility and the current PWA interface.',
    '- Do not add paid services, persistent workers, cron jobs or background indexing.',
    '- Never write directly to the default branch. Use a separate working branch and open a PR.',
    '- Run the relevant lint, typecheck, tests and build where available. Report exactly what was run and what was not run.',
    '- Do not claim that a test, build or check passed unless it actually ran.',
    '- At the end, report changed files, verification results, known limitations and manual migration steps.',
    ''
  );

  lines.push(
    '## Result hand-off',
    '',
    'Return: the working branch, commit SHA(s), PR URL if created, files changed, commands run with their results, and any acceptance criterion that remains unverified.',
    ''
  );

  return lines.join('\n').trim();
}

export function createTaskInput(input: DevTaskInput): DevTaskInput {
  return {
    title: text(input.title, 'Инженерное задание').trim() || 'Инженерное задание',
    objective: text(input.objective),
    context: text(input.context),
    repository: input.repository,
    baseRef: text(input.baseRef, 'main'),
    baseCommit: input.baseCommit || null,
    affectedFiles: list(input.affectedFiles),
    currentBehavior: text(input.currentBehavior),
    requiredBehavior: text(input.requiredBehavior),
    technicalPlan: text(input.technicalPlan),
    backendChanges: list(input.backendChanges),
    frontendChanges: list(input.frontendChanges),
    databaseChanges: list(input.databaseChanges),
    mobileChanges: list(input.mobileChanges),
    migrations: list(input.migrations),
    securityConstraints: list(input.securityConstraints),
    tests: list(input.tests),
    acceptanceCriteria: list(input.acceptanceCriteria),
    unverified: list(input.unverified),
    conversationId: input.conversationId || null,
    decisionIds: list(input.decisionIds),
    projectId: input.projectId || null,
    status: status(input.status),
  };
}

function fullRow(input: DevTaskInput): Record<string, unknown> {
  return {
    repository: String(input.repository || 'newlove'),
    base_ref: input.baseRef || 'main',
    base_commit: input.baseCommit || null,
    task: input.title,
    prompt_text: '',
    affected_files: input.affectedFiles || [],
    backend_changes: input.backendChanges || [],
    mobile_changes: input.mobileChanges || [],
    migrations: input.migrations || [],
    tests: input.tests || [],
    acceptance_criteria: input.acceptanceCriteria || [],
    security_constraints: input.securityConstraints || [],
    unverified: input.unverified || [],
    conversation_id: input.conversationId || null,
    project_id: input.projectId || null,
    decision_ids: input.decisionIds || [],
    status: input.status || 'draft',
    title: input.title,
    objective: input.objective || '',
    context: input.context || '',
    current_behavior: input.currentBehavior || '',
    required_behavior: input.requiredBehavior || '',
    technical_plan: input.technicalPlan || '',
    frontend_changes: input.frontendChanges || [],
    database_changes: input.databaseChanges || [],
    pull_requests: [],
    result_notes: '',
  };
}

function legacyRow(input: DevTaskInput): Record<string, unknown> {
  const row = fullRow(input);
  for (const key of [
    'title',
    'objective',
    'context',
    'current_behavior',
    'required_behavior',
    'technical_plan',
    'frontend_changes',
    'database_changes',
    'pull_requests',
    'result_notes',
  ]) {
    delete row[key];
  }
  return row;
}

async function insertWithFallback(
  store: ReturnType<typeof getServerSupabaseClient>,
  row: Record<string, unknown>,
  legacy: Record<string, unknown>
) {
  const first = await store.from('pierrot_dev_prompts').insert(row).select('*').single();
  if (!first.error) return first;
  if (!missingColumn(first.error)) return first;

  // Production already has pierrot_dev_prompts, but the additive Task Studio
  // columns may not be applied yet. Degrade to the legacy schema instead of
  // hiding the feature behind a hard failure.
  return store.from('pierrot_dev_prompts').insert(legacy).select('*').single();
}

export async function createDevTask(userId: string, rawInput: DevTaskInput): Promise<DevTask> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const input = createTaskInput(rawInput);
  if (input.projectId && !(await getPierrotProject(userId, input.projectId))) {
    throw new Error('PROJECT_NOT_FOUND');
  }
  const config = resolveDevRepository(input.repository);
  // Production stores owner/repo (the CHECK constraint rejects a bare key),
  // while the UI/API use the short key. Normalize at the persistence boundary.
  input.repository = config.fullName;

  const prompt = buildTaskPrompt({
    ...input,
    title: input.title,
    objective: input.objective || '',
    context: input.context || '',
    repository: config.fullName,
    baseRef: input.baseRef || config.workBranch,
    baseCommit: input.baseCommit || null,
    affectedFiles: input.affectedFiles || [],
    currentBehavior: input.currentBehavior || '',
    requiredBehavior: input.requiredBehavior || '',
    technicalPlan: input.technicalPlan || '',
    backendChanges: input.backendChanges || [],
    frontendChanges: input.frontendChanges || [],
    databaseChanges: input.databaseChanges || [],
    mobileChanges: input.mobileChanges || [],
    migrations: input.migrations || [],
    securityConstraints: input.securityConstraints || [],
    tests: input.tests || [],
    acceptanceCriteria: input.acceptanceCriteria || [],
    unverified: input.unverified || [],
    conversationId: input.conversationId || null,
    decisionIds: input.decisionIds || [],
    status: input.status || 'draft',
    id: '',
    userId: null,
    verificationStatus: null,
    verificationNotes: '',
    pullRequests: [],
    resultCommit: null,
    resultNotes: '',
    verifiedAt: null,
    createdAt: '',
    updatedAt: '',
    promptText: '',
  });

  const row = fullRow({
    ...input,
    baseRef: input.baseRef || config.workBranch,
    repository: config.fullName,
  });
  row.prompt_text = prompt;
  row.user_id = isUuid(userId) ? userId : null;

  const result = await insertWithFallback(store, row, {
    ...legacyRow({ ...input, baseRef: input.baseRef || config.workBranch }),
    prompt_text: prompt,
    user_id: isUuid(userId) ? userId : null,
  });

  if (result.error) {
    if (missingTable(result.error)) throw new Error('DEV_TASKS_TABLE_MISSING');
    throw result.error;
  }

  return mapRow(result.data);
}

export async function listDevTasks(
  userId: string,
  limit = 40
): Promise<{ tasks: DevTask[]; migrationRequired: boolean }> {
  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    let query = store
      .from('pierrot_dev_prompts')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));

    if (isUuid(userId)) query = query.eq('user_id', userId);

    const { data, error } = await query;
    if (error) {
      return { tasks: [], migrationRequired: missingTable(error) };
    }

    return {
      tasks: (Array.isArray(data) ? data : []).map((row) => mapRow(row)),
      migrationRequired: false,
    };
  } catch {
    return { tasks: [], migrationRequired: false };
  }
}

export async function getDevTask(userId: string, id: string): Promise<DevTask | null> {
  if (!isUuid(id)) return null;

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    let query = store.from('pierrot_dev_prompts').select('*').eq('id', id);
    if (isUuid(userId)) query = query.eq('user_id', userId);

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return mapRow(data);
  } catch {
    return null;
  }
}

/**
 * Idempotency boundary for memory → Dev transfers. The task stores the source
 * decision ID in the existing `decision_ids` array, so a retry cannot create a
 * second Dev task even if updating the source memory row failed.
 */
export async function findDevTaskByDecisionId(
  userId: string,
  decisionId: string
): Promise<DevTask | null> {
  if (!isUuid(decisionId)) return null;

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    let query = store
      .from('pierrot_dev_prompts')
      .select('*')
      .contains('decision_ids', [decisionId])
      .order('created_at', { ascending: false })
      .limit(1);

    if (isUuid(userId)) query = query.eq('user_id', userId);

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return mapRow(data);
  } catch {
    return null;
  }
}

export async function updateDevTask(
  userId: string,
  id: string,
  patch: Partial<DevTaskInput>
): Promise<DevTask | null> {
  const existing = await getDevTask(userId, id);
  if (!existing) return null;

  const mergedInput: DevTaskInput = {
    title: patch.title ?? existing.title,
    objective: patch.objective ?? existing.objective,
    context: patch.context ?? existing.context,
    repository: patch.repository ?? existing.repository,
    baseRef: patch.baseRef ?? existing.baseRef,
    baseCommit: patch.baseCommit ?? existing.baseCommit,
    affectedFiles: patch.affectedFiles ?? existing.affectedFiles,
    currentBehavior: patch.currentBehavior ?? existing.currentBehavior,
    requiredBehavior: patch.requiredBehavior ?? existing.requiredBehavior,
    technicalPlan: patch.technicalPlan ?? existing.technicalPlan,
    backendChanges: patch.backendChanges ?? existing.backendChanges,
    frontendChanges: patch.frontendChanges ?? existing.frontendChanges,
    databaseChanges: patch.databaseChanges ?? existing.databaseChanges,
    mobileChanges: patch.mobileChanges ?? existing.mobileChanges,
    migrations: patch.migrations ?? existing.migrations,
    securityConstraints: patch.securityConstraints ?? existing.securityConstraints,
    tests: patch.tests ?? existing.tests,
    acceptanceCriteria: patch.acceptanceCriteria ?? existing.acceptanceCriteria,
    unverified: patch.unverified ?? existing.unverified,
    conversationId: patch.conversationId ?? existing.conversationId,
    projectId: patch.projectId ?? existing.projectId,
    decisionIds: patch.decisionIds ?? existing.decisionIds,
    status: patch.status ?? existing.status,
  };

  const normalized = createTaskInput(mergedInput);
  const repositoryConfig = resolveDevRepository(normalized.repository || existing.repository);
  normalized.repository = repositoryConfig.fullName;
  const prompt = buildTaskPrompt({
    ...existing,
    ...normalized,
    title: normalized.title,
    objective: normalized.objective || '',
    context: normalized.context || '',
    repository: repositoryConfig.fullName,
    baseRef: normalized.baseRef || existing.baseRef,
    baseCommit: normalized.baseCommit || null,
    affectedFiles: normalized.affectedFiles || [],
    currentBehavior: normalized.currentBehavior || '',
    requiredBehavior: normalized.requiredBehavior || '',
    technicalPlan: normalized.technicalPlan || '',
    backendChanges: normalized.backendChanges || [],
    frontendChanges: normalized.frontendChanges || [],
    databaseChanges: normalized.databaseChanges || [],
    mobileChanges: normalized.mobileChanges || [],
    migrations: normalized.migrations || [],
    securityConstraints: normalized.securityConstraints || [],
    tests: normalized.tests || [],
    acceptanceCriteria: normalized.acceptanceCriteria || [],
    unverified: normalized.unverified || [],
    conversationId: normalized.conversationId || null,
    decisionIds: normalized.decisionIds || [],
    status: normalized.status || existing.status,
    promptText: '',
  });

  const store = getServerSupabaseClient({ useServiceRole: true });
  const fullPatch: Record<string, unknown> = {
    task: normalized.title,
    title: normalized.title,
    objective: normalized.objective || '',
    context: normalized.context || '',
    repository: normalized.repository,
    base_ref: normalized.baseRef || existing.baseRef,
    base_commit: normalized.baseCommit || null,
    affected_files: normalized.affectedFiles || [],
    current_behavior: normalized.currentBehavior || '',
    required_behavior: normalized.requiredBehavior || '',
    technical_plan: normalized.technicalPlan || '',
    backend_changes: normalized.backendChanges || [],
    frontend_changes: normalized.frontendChanges || [],
    database_changes: normalized.databaseChanges || [],
    mobile_changes: normalized.mobileChanges || [],
    migrations: normalized.migrations || [],
    security_constraints: normalized.securityConstraints || [],
    tests: normalized.tests || [],
    acceptance_criteria: normalized.acceptanceCriteria || [],
    unverified: normalized.unverified || [],
    conversation_id: normalized.conversationId || null,
    project_id: normalized.projectId || null,
    decision_ids: normalized.decisionIds || [],
    status: normalized.status || existing.status,
    prompt_text: prompt,
    updated_at: new Date().toISOString(),
  };

  let result = await store
    .from('pierrot_dev_prompts')
    .update(fullPatch)
    .eq('id', id)
    .select('*')
    .single();

  if (result.error && missingColumn(result.error)) {
    const legacyPatch: Record<string, unknown> = {
      task: normalized.title,
      repository: normalized.repository,
      base_ref: normalized.baseRef || existing.baseRef,
      base_commit: normalized.baseCommit || null,
      affected_files: normalized.affectedFiles || [],
      backend_changes: normalized.backendChanges || [],
      mobile_changes: normalized.mobileChanges || [],
      migrations: normalized.migrations || [],
      tests: normalized.tests || [],
      acceptance_criteria: normalized.acceptanceCriteria || [],
      security_constraints: normalized.securityConstraints || [],
      unverified: normalized.unverified || [],
      conversation_id: normalized.conversationId || null,
      decision_ids: normalized.decisionIds || [],
      status: normalized.status || existing.status,
      prompt_text: prompt,
      updated_at: new Date().toISOString(),
    };
    result = await store
      .from('pierrot_dev_prompts')
      .update(legacyPatch)
      .eq('id', id)
      .select('*')
      .single();
  }

  if (result.error || !result.data) return null;
  return mapRow(result.data);
}

export async function attachDevTaskResult(input: {
  userId: string;
  taskId: string;
  resultCommit?: string | null;
  pullRequests?: string[];
  resultNotes?: string;
  verificationStatus?: DevVerificationStatus | null;
  verificationNotes?: string;
  status?: DevTaskStatus;
}): Promise<DevTask | null> {
  const existing = await getDevTask(input.userId, input.taskId);
  if (!existing) return null;

  const store = getServerSupabaseClient({ useServiceRole: true });
  const nextVerification =
    input.verificationStatus === undefined ? existing.verificationStatus : input.verificationStatus;
  const patch: Record<string, unknown> = {
    result_commit: input.resultCommit || null,
    pull_requests: input.pullRequests || existing.pullRequests,
    result_notes: text(input.resultNotes ?? existing.resultNotes),
    verification_status: storedVerificationStatus(nextVerification),
    verification_notes: text(input.verificationNotes ?? existing.verificationNotes),
    status: status(input.status, existing.status),
    updated_at: new Date().toISOString(),
  };

  const result = await store
    .from('pierrot_dev_prompts')
    .update(patch)
    .eq('id', input.taskId)
    .select('*')
    .single();

  if (result.error && missingColumn(result.error)) {
    const legacyPatch = {
      result_commit: input.resultCommit || null,
      verification_status: storedVerificationStatus(nextVerification),
      verification_notes: text(input.verificationNotes ?? existing.verificationNotes),
      status: status(input.status, existing.status),
      updated_at: new Date().toISOString(),
    };
    const legacyResult = await store
      .from('pierrot_dev_prompts')
      .update(legacyPatch)
      .eq('id', input.taskId)
      .select('*')
      .single();
    if (legacyResult.error || !legacyResult.data) return null;
    return mapRow(legacyResult.data);
  }

  if (result.error || !result.data) return null;
  return mapRow(result.data);
}

export async function saveDevTaskReview(input: {
  userId: string;
  taskId: string;
  report: DevReviewReport;
}): Promise<DevTask | null> {
  const existing = await getDevTask(input.userId, input.taskId);
  if (!existing) return null;

  const store = getServerSupabaseClient({ useServiceRole: true });
  // Keep the persisted report compact: findings and file metadata are enough
  // for history. Full patches can be re-read from GitHub when needed.
  const compactReport: DevReviewReport = {
    ...input.report,
    changedFiles: input.report.changedFiles.map((file) => ({
      ...file,
      patch: null,
    })),
  };
  const notes = [
    `Verdict: ${input.report.verdict}`,
    '',
    input.report.summary,
    '',
    ...input.report.findings.map(
      (finding) =>
        `- [${finding.severity}] ${finding.file || 'general'}${finding.line ? `:${finding.line}` : ''} — ${finding.problem}`
    ),
    '',
    `Tests executed: ${input.report.checks.testsExecuted ? 'yes' : 'no'}`,
    input.report.checks.note,
    '',
    ...input.report.limitations.map((item) => `- ${item}`),
  ]
    .join('\n')
    .slice(0, 16_000);

  const result = await store
    .from('pierrot_dev_prompts')
    .update({
      verification_status: storedVerificationStatus(input.report.verdict),
      verification_notes: notes,
      verification_report: compactReport,
      result_commit: input.report.headCommit,
      verified_at: new Date().toISOString(),
      status: input.report.verdict === 'rejected' ? 'rejected' : 'review',
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.taskId)
    .select('*')
    .single();

  if (result.error || !result.data) {
    return attachDevTaskResult({
      userId: input.userId,
      taskId: input.taskId,
      resultCommit: input.report.headCommit,
      verificationStatus: input.report.verdict,
      verificationNotes: notes,
      status: input.report.verdict === 'rejected' ? 'rejected' : 'review',
    });
  }

  return mapRow(result.data);
}
