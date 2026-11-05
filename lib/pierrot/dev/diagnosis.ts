import type {
  DevDiagnosis,
  DevDiagnosisChanges,
  DevDiagnosisConfidence,
  DevDiagnosisFile,
  DevDiagnosisFinding,
  DevRepositoryKey,
  DevTaskInput,
  DevToolTraceEntry,
} from './types';

/**
 * Parsing and validation for the structured diagnosis block.
 *
 * This module is deliberately free of server-only imports: the same validation
 * is used by the API route, the request store and the Task Studio UI.
 */

const MAX_TEXT = 4_000;
const MAX_SHORT = 400;
const MAX_LIST = 30;
const MAX_PATH = 260;
const FILE_REF_PATTERN = /([A-Za-z0-9_./-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?/g;

type TraceFileRanges = Map<string, Array<[number, number]>>;

function text(value: unknown, limit = MAX_TEXT): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function rawText(value: unknown, limit = MAX_TEXT): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function stringList(value: unknown, limit = MAX_LIST): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/g, ' ').trim().slice(0, MAX_SHORT))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');

  if (!normalized || normalized.length > MAX_PATH) return null;
  if (normalized.includes('..')) return null;
  if (!/^[A-Za-z0-9_./@+~ -]+$/.test(normalized)) return null;
  return normalized;
}

function confidence(value: unknown): DevDiagnosisConfidence {
  return value === 'confirmed' || value === 'likely' || value === 'unverified'
    ? value
    : 'unverified';
}

function repositoryKey(value: unknown, trace: DevToolTraceEntry[]): DevRepositoryKey {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'newlove' || normalized === 'pierrot') return normalized;

  const fromTrace = trace
    .map((entry) => entry.meta?.repository || '')
    .map((fullName) => (fullName.toLowerCase().includes('pierrot') ? 'pierrot' : 'newlove'))
    .find(Boolean);

  return fromTrace || 'newlove';
}

function traceFiles(trace: DevToolTraceEntry[]): TraceFileRanges {
  const index: TraceFileRanges = new Map();

  const ensure = (path: string) => {
    if (!index.has(path)) index.set(path, []);
    return index.get(path) as Array<[number, number]>;
  };

  for (const entry of trace) {
    for (const path of entry.meta?.paths || []) {
      const normalized = normalizePath(path);
      if (normalized) ensure(normalized);
    }

    for (const range of entry.meta?.ranges || []) {
      const normalized = normalizePath(range.path);
      if (!normalized) continue;
      const start = Math.max(1, Math.round(range.startLine));
      const end = Math.max(start, Math.round(range.endLine));
      ensure(normalized).push([start, end]);
    }
  }

  return index;
}

function rangeWithinKnown(
  ranges: Array<[number, number]> | undefined,
  startLine: unknown,
  endLine: unknown
): { startLine: number | null; endLine: number | null } {
  if (!ranges || ranges.length === 0) return { startLine: null, endLine: null };
  if (typeof startLine !== 'number' || !Number.isFinite(startLine)) {
    return { startLine: null, endLine: null };
  }

  const start = Math.max(1, Math.round(startLine));
  const requestedEnd =
    typeof endLine === 'number' && Number.isFinite(endLine)
      ? Math.max(start, Math.round(endLine))
      : start;

  const match = ranges.find(([from, to]) => start >= from && start <= to);
  if (!match) return { startLine: null, endLine: null };

  return {
    startLine: start,
    endLine: Math.min(requestedEnd, match[1]),
  };
}

function sanitizeEvidence(value: unknown, files: TraceFileRanges): string {
  const evidence = rawText(value, MAX_SHORT);
  if (!evidence) return evidence;

  return evidence
    .replace(FILE_REF_PATTERN, (match, rawPath: string, rawLine: string) => {
      const path = normalizePath(rawPath);
      if (!path) return match;

      // With no read trace at all, a line number is never verifiable.
      if (files.size === 0) return `\`${path}\``;

      const ranges = files.get(path);
      if (!ranges) return `\`${path}\``;

      const line = Number(rawLine);
      const supported = ranges.some(([from, to]) => line >= from && line <= to);
      return supported ? `\`${path}:${line}\`` : `\`${path}\``;
    })
    .slice(0, MAX_TEXT);
}

function sanitizeFindings(value: unknown, files: TraceFileRanges): DevDiagnosisFinding[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      statement: text(item.statement, MAX_TEXT),
      evidence: sanitizeEvidence(item.evidence, files),
    }))
    .filter((item) => item.statement.length > 0)
    .slice(0, MAX_LIST);
}

function sanitizeChanges(value: unknown): DevDiagnosisChanges {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    backend: stringList(record.backend),
    frontend: stringList(record.frontend),
    database: stringList(record.database),
    mobile: stringList(record.mobile),
  };
}

function sanitizeFiles(value: unknown, files: TraceFileRanges): DevDiagnosisFile[] {
  if (!Array.isArray(value) || files.size === 0) return [];

  const result: DevDiagnosisFile[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const path = normalizePath(record.path);
    if (!path || seen.has(path)) continue;
    if (!files.has(path)) continue;

    const range = rangeWithinKnown(files.get(path), record.startLine, record.endLine);
    seen.add(path);
    result.push({
      path,
      startLine: range.startLine,
      endLine: range.endLine,
    });

    if (result.length >= MAX_LIST) break;
  }

  return result;
}

export function sanitizeDevDiagnosis(
  value: unknown,
  trace: DevToolTraceEntry[] = []
): DevDiagnosis | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const files = traceFiles(trace);
  const inspectedFiles = sanitizeFiles(record.inspectedFiles, files);
  const confirmedFindings = sanitizeFindings(record.confirmedFindings, files);
  const likelyFindings = sanitizeFindings(record.likelyFindings, files);
  const hypotheses = sanitizeFindings(record.hypotheses, files);
  const recommendedFix = rawText(record.recommendedFix, MAX_TEXT);
  const taskSummary = text(record.taskSummary || recommendedFix, MAX_SHORT);

  if (
    !taskSummary &&
    !recommendedFix &&
    confirmedFindings.length === 0 &&
    likelyFindings.length === 0 &&
    hypotheses.length === 0
  ) {
    return null;
  }

  const commitShas = trace
    .map((entry) => entry.meta?.commitSha)
    .filter((sha): sha is string => typeof sha === 'string' && sha.length > 0);
  const rawCommit =
    typeof record.commitSha === 'string' ? record.commitSha.trim().toLowerCase() : '';
  const commitSha = /^[0-9a-f]{7,40}$/.test(rawCommit)
    ? commitShas.some((sha) => sha.toLowerCase() === rawCommit)
      ? rawCommit
      : commitShas[0] || null
    : commitShas[0] || null;

  const ref =
    text(record.ref, 200) || trace.find((entry) => entry.meta?.branch)?.meta?.branch || 'main';

  return {
    taskSummary: taskSummary || 'Repository investigation',
    repository: repositoryKey(record.repository, trace),
    ref,
    commitSha,
    inspectedFiles,
    confirmedFindings,
    likelyFindings,
    hypotheses,
    recommendedFix,
    risks: stringList(record.risks),
    tests: stringList(record.tests),
    changes: sanitizeChanges(record.changes),
    shouldCreateTask: record.shouldCreateTask === true,
    confidence: confidence(record.confidence),
  };
}

/**
 * Removes the machine-readable block from the visible answer and validates its
 * contents against the real tool trace.
 */
export function extractDevDiagnosis(
  reply: string,
  trace: DevToolTraceEntry[] = []
): { reply: string; diagnosis: DevDiagnosis | null } {
  const blocks = Array.from(reply.matchAll(/<dev_diagnosis>([\s\S]*?)<\/dev_diagnosis>/gi));
  const raw = blocks.length > 0 ? blocks[blocks.length - 1][1] : null;

  let visible = reply;
  if (blocks.length > 0) {
    visible = reply.replace(/<dev_diagnosis>[\s\S]*?<\/dev_diagnosis>/gi, '');
  } else {
    const open = reply.search(/<dev_diagnosis>/i);
    if (open >= 0) visible = reply.slice(0, open);
  }

  let diagnosis: DevDiagnosis | null = null;
  if (raw) {
    try {
      diagnosis = sanitizeDevDiagnosis(JSON.parse(raw), trace);
    } catch {
      diagnosis = null;
    }
  }

  return { reply: visible.trim(), diagnosis };
}

export function diagnosisFromEvents(
  events: Array<{ type?: unknown; diagnosis?: unknown }>
): DevDiagnosis | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === 'diagnosis' && event.diagnosis) {
      return (event.diagnosis as DevDiagnosis) || null;
    }
  }
  return null;
}

function findingLines(label: string, findings: DevDiagnosisFinding[]): string[] {
  return findings.map((finding) => `${label}: ${finding.statement}`);
}

function planSection(title: string, values: string[]): string[] {
  if (values.length === 0) return [];
  return [title, ...values.map((value) => `- ${value}`), ''];
}

/**
 * Converts a validated diagnosis into a draft Task Studio input. The owner can
 * review and edit every field before saving. Only paths that were actually read
 * survive validation and appear here.
 */
export function diagnosisToTaskInput(
  diagnosis: DevDiagnosis,
  options: {
    conversationId?: string | null;
    baseRef?: string | null;
    baseCommit?: string | null;
  } = {}
): DevTaskInput {
  const findings = [
    ...findingLines('Confirmed', diagnosis.confirmedFindings),
    ...findingLines('Likely', diagnosis.likelyFindings),
  ];

  const technicalPlan = [
    ...planSection('Confirmed diagnosis', findings),
    ...planSection('Recommended fix', diagnosis.recommendedFix ? [diagnosis.recommendedFix] : []),
    ...planSection('Backend', diagnosis.changes.backend),
    ...planSection('Frontend', diagnosis.changes.frontend),
    ...planSection('Database', diagnosis.changes.database),
    ...planSection('Mobile', diagnosis.changes.mobile),
    ...planSection('Risks', diagnosis.risks),
  ]
    .join('\n')
    .trim();

  return {
    title: diagnosis.taskSummary,
    objective: diagnosis.taskSummary,
    context: [
      `Repository: ${diagnosis.repository}`,
      `Ref: ${diagnosis.ref}`,
      `Commit: ${diagnosis.commitSha || 'unknown'}`,
      `Confidence: ${diagnosis.confidence}`,
      diagnosis.inspectedFiles.length > 0
        ? `Inspected files: ${diagnosis.inspectedFiles.map((file) => file.path).join(', ')}`
        : 'Inspected files: not established',
    ].join('\n'),
    repository: diagnosis.repository,
    baseRef: options.baseRef || diagnosis.ref || 'main',
    baseCommit: options.baseCommit || diagnosis.commitSha,
    affectedFiles: diagnosis.inspectedFiles.map((file) => file.path),
    currentBehavior:
      findings.length > 0
        ? findings.join('\n')
        : 'The inspected source does not yet establish the current behaviour.',
    requiredBehavior:
      diagnosis.recommendedFix ||
      'Establish the cause with additional evidence before changing code.',
    technicalPlan:
      technicalPlan ||
      'Run the next concrete check, then define the smallest change supported by evidence.',
    backendChanges: diagnosis.changes.backend,
    frontendChanges: diagnosis.changes.frontend,
    databaseChanges: diagnosis.changes.database,
    mobileChanges: diagnosis.changes.mobile,
    tests: diagnosis.tests,
    acceptanceCriteria: [
      'The described current behaviour is reproduced before the fix.',
      'The change is limited to files supported by evidence unless new evidence requires another file.',
      'All listed tests pass; tests that were not run are reported as not run.',
    ],
    securityConstraints: [
      'Owner-only access; do not expose repository evidence to public visitors.',
      'Repository tools stay read-only; no direct commits, branch writes or automatic PRs.',
      'No production migration without explicit approval and provided SQL.',
      'No cron, workers, polling, background indexing or additional paid services.',
    ],
    unverified: [
      ...diagnosis.hypotheses.map((finding) => finding.statement),
      ...(diagnosis.confidence !== 'confirmed'
        ? [`Overall confidence: ${diagnosis.confidence}`]
        : []),
    ],
    conversationId: options.conversationId || null,
    status: 'draft',
  };
}
