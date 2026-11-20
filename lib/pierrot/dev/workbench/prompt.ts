import { assertServerOnly } from '@/lib/serverOnly';
import type { TaskExecutionMaterial } from './store';

assertServerOnly('lib/pierrot/dev/workbench/prompt');

/** Hard resource limits communicated to the executor. Never secrets. */
export const EXECUTION_LIMITS = {
  timeoutMs: Number(process.env.PIERROT_DEV_TASK_TIMEOUT_MS || 45 * 60 * 1000),
  maxLogBytes: Number(process.env.PIERROT_DEV_MAX_LOG_BYTES || 2_000_000),
  maxFilesChanged: 120,
} as const;

/**
 * Prompt handed to `opencode run`. The task prompt already contains the owner
 * approved specification; this wrapper adds the execution contract that the
 * runner enforces (branch, commit, no push, no secrets, bounded scope).
 */
export function buildExecutionPrompt(input: {
  task: TaskExecutionMaterial;
  attemptId: string;
  attemptNumber: number;
  branch: string;
  repositoryFullName: string;
  baseRef: string;
  baseCommit: string | null;
}): string {
  const { task } = input;
  const lines: string[] = [];

  lines.push(
    `# PIERROT EXECUTION CONTRACT`,
    ``,
    `Task ID: ${task.id}`,
    `Attempt ID: ${input.attemptId}`,
    `Attempt: ${input.attemptNumber}`,
    `Repository: ${input.repositoryFullName}`,
    `Base ref: ${input.baseRef}`,
    input.baseCommit ? `Base commit: ${input.baseCommit}` : '',
    `Working branch (already created): ${input.branch}`,
    ``,
    `## Execution rules`,
    ``,
    `1. Work only inside the current repository working directory. Do not leave it.`,
    `2. Do not run git commands that rewrite history, switch branches, push, create pull requests, merge or deploy. The runner owns git, push, commit and PR creation.`,
    `3. Never read, print, copy or modify secrets: .env files, credential files, private keys, tokens, Supabase service keys, GitHub tokens or production credentials.`,
    `4. Do not deploy to production, do not call Vercel or Supabase management APIs, do not enable paid services.`,
    `5. Do not modify unrelated modules. Keep the diff focused on the task.`,
    `6. Run the relevant lint, typecheck and tests for the touched area when they exist and are reasonably fast. Never claim a command passed unless it actually ran and exited 0.`,
    `7. Do not add a migration unless the task explicitly requires it. Migrations must be additive and must not be applied to production.`,
    `8. Keep every user-facing flow working. Preserve existing URLs and data compatibility.`,
    `9. Resource limits: execution timeout ${Math.round(EXECUTION_LIMITS.timeoutMs / 60000)} minutes, at most ${EXECUTION_LIMITS.maxFilesChanged} changed files.`,
    `10. If the task is blocked or under-specified, stop and explain the blocker instead of inventing scope.`,
    ``,
    `## Required final answer`,
    ``,
    `End your answer with a fenced JSON block exactly in this shape:`,
    ``,
    '```json',
    `{`,
    `  "summary": "what changed and why",`,
    `  "changedFiles": ["path"],`,
    `  "commands": [{"name": "pnpm typecheck", "status": "passed|failed|skipped", "detail": "exit code / short result"}],`,
    `  "acceptanceCriteria": [{"criterion": "exact criterion text", "status": "satisfied|not_verified|failed", "evidence": "concrete evidence"}],`,
    `  "warnings": ["remaining risk"],`,
    `  "unverified": ["what you could not verify"]`,
    `}`,
    '```',
    ``,
    `This JSON is stored as self-reported execution evidence and is never treated as proof on its own.`,
    ``,
    `---`,
    ``,
    `## Owner approved task specification`,
    ``,
    task.promptText ||
      [
        `# ${task.title}`,
        ``,
        `Acceptance criteria:`,
        ...task.acceptanceCriteria.map((criterion) => `- ${criterion}`),
        ``,
        `Tests:`,
        ...task.tests.map((test) => `- ${test}`),
      ].join('\n'),
    ``
  );

  if (task.acceptanceCriteria.length > 0) {
    lines.push(
      `## Acceptance criteria (must be evidenced)`,
      ``,
      ...task.acceptanceCriteria.map((criterion) => `- ${criterion}`),
      ``
    );
  }

  if (task.tests.length > 0) {
    lines.push(`## Requested checks`, ``, ...task.tests.map((test) => `- ${test}`), ``);
  }

  if (task.securityConstraints.length > 0) {
    lines.push(
      `## Security constraints (mandatory)`,
      ``,
      ...task.securityConstraints.map((item) => `- ${item}`),
      ``
    );
  }

  return lines
    .filter((line) => line !== null)
    .join('\n')
    .trim();
}

/** Last complete top-level JSON objects, bounded to avoid a huge log copy. */
function completeJsonObjects(text: string, limit = 20): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        if (objects.length > limit) objects.shift();
        start = -1;
      }
    }
  }
  return objects;
}

/**
 * Structured result block parser for the executor's final answer. Bounded and
 * defensive: anything malformed is ignored rather than trusted.
 */
export function parseExecutorReport(raw: string): {
  summary: string;
  changedFiles: string[];
  commands: Array<{
    name: string;
    status: 'passed' | 'failed' | 'skipped' | 'unknown';
    detail?: string;
  }>;
  criteria: Array<{
    criterion: string;
    status: 'satisfied' | 'not_verified' | 'failed';
    evidence: string;
  }>;
  warnings: string[];
  unverified: string[];
} {
  const fallback = {
    summary: '',
    changedFiles: [] as string[],
    commands: [] as Array<{
      name: string;
      status: 'passed' | 'failed' | 'skipped' | 'unknown';
      detail?: string;
    }>,
    criteria: [] as Array<{
      criterion: string;
      status: 'satisfied' | 'not_verified' | 'failed';
      evidence: string;
    }>,
    warnings: [] as string[],
    unverified: [] as string[],
  };

  if (typeof raw !== 'string' || raw.length === 0) return fallback;

  const extract = (input: string) => [...input.matchAll(/```json\s*([\s\S]*?)```/gi)];
  const candidates: string[] = [];
  const direct = extract(raw);
  if (direct.length > 0) {
    // The last fenced block is the executor's answer. If it is malformed we do
    // not silently fall back to an earlier, unrelated block.
    candidates.push(direct[direct.length - 1][1]);
  }
  if (!raw.includes('\n') && raw.includes('\\n')) {
    // JSON-formatted CLI output escapes newlines and quotes inside a string.
    const decoded = raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const decodedBlocks = extract(decoded);
    if (decodedBlocks.length > 0) {
      candidates.push(decodedBlocks[decodedBlocks.length - 1][1]);
    }
  } else if (direct.length === 0) {
    // A model may ignore the fence but still end with the required JSON object.
    for (const object of completeJsonObjects(raw).reverse()) candidates.push(object);
  }

  const isReport = (value: Record<string, unknown>) =>
    ['summary', 'changedFiles', 'commands', 'acceptanceCriteria', 'warnings', 'unverified'].some(
      (key) => Object.prototype.hasOwnProperty.call(value, key)
    );
  let parsed: Record<string, unknown> | null = null;
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value) && isReport(value)) {
        parsed = value as Record<string, unknown>;
        break;
      }
    } catch {
      // Try the next candidate; malformed blocks are never trusted.
    }
  }
  if (!parsed) return fallback;
  const strings = (value: unknown, limit: number): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, limit)
      : [];

  const commands = Array.isArray(parsed.commands)
    ? parsed.commands
        .filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
        )
        .slice(0, 30)
        .map((item) => {
          const status = String(item.status || 'unknown');
          return {
            name: String(item.name || 'command').slice(0, 300),
            status: (['passed', 'failed', 'skipped'].includes(status) ? status : 'unknown') as
              | 'passed'
              | 'failed'
              | 'skipped'
              | 'unknown',
            detail: typeof item.detail === 'string' ? item.detail.slice(0, 1000) : undefined,
          };
        })
    : [];

  const criteria = Array.isArray(parsed.acceptanceCriteria)
    ? parsed.acceptanceCriteria
        .filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
        )
        .slice(0, 40)
        .map((item) => {
          const status = String(item.status || 'not_verified');
          return {
            criterion: String(item.criterion || '').slice(0, 1000),
            status: (['satisfied', 'not_verified', 'failed'].includes(status)
              ? status
              : 'not_verified') as 'satisfied' | 'not_verified' | 'failed',
            evidence: String(item.evidence || '').slice(0, 2000),
          };
        })
        .filter((item) => item.criterion.length > 0)
    : [];

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 12_000) : '',
    changedFiles: strings(parsed.changedFiles, 200).map((file) => file.slice(0, 500)),
    commands,
    criteria,
    warnings: strings(parsed.warnings, 40).map((item) => item.slice(0, 1000)),
    unverified: strings(parsed.unverified, 40).map((item) => item.slice(0, 1000)),
  };
}
