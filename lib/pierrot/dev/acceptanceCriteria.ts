/**
 * Deterministic acceptance-criteria generation shared by Task Studio UI and
 * server-only task creation. This module must stay free of runtime imports so
 * the owner UI can show the exact criteria that the server will persist.
 */

export type AcceptanceCriteriaInput = {
  title?: string | null;
  objective?: string | null;
  requiredBehavior?: string | null;
  affectedFiles?: string[] | null;
  backendChanges?: string[] | null;
  frontendChanges?: string[] | null;
  databaseChanges?: string[] | null;
  mobileChanges?: string[] | null;
  tests?: string[] | null;
  acceptanceCriteria?: string[] | null;
};

export type AcceptanceCriteriaDerivation = 'provided' | 'generated' | 'unavailable';

export type AcceptanceCriteriaResolution = {
  criteria: string[];
  derivation: AcceptanceCriteriaDerivation;
  /** Present only when derivation is unavailable. */
  reason: string | null;
};

const MAX_CRITERIA = 8;
const MAX_CRITERION_LENGTH = 400;
const MAX_COMPONENTS = 8;
const MAX_CHECKS = 6;
const MIN_GOAL_LENGTH = 12;
const MIN_CRITERION_LENGTH = 8;

/**
 * Criteria such as "done", "ok" or "works" cannot be verified against a diff,
 * a command or a manual check. They must not satisfy the queue gate.
 */
const NON_VERIFIABLE = new Set([
  'done',
  'fixed',
  'ok',
  'okay',
  'works',
  'works fine',
  'all good',
  'ready',
  'complete',
  'completed',
  'готово',
  'исправлено',
  'работает',
  'сделано',
  'ок',
  'хорошо',
]);

/** Placeholder titles are not goals and must not produce "verifiable" criteria. */
const NON_GOALS = new Set([
  'без названия',
  'доработка',
  'задача',
  'задание',
  'изменения',
  'инженерное задание',
  'исправление',
  'fix',
  'fix bug',
  'fix issue',
  'improve',
  'task',
  'update',
]);

function collapse(value: unknown): string {
  return typeof value === 'string'
    ? value
        .replace(/\s+/g, ' ')
        .replace(/[.;\s]+$/u, '')
        .trim()
    : '';
}

function words(value: string): string[] {
  return value.match(/[\p{L}\p{N}][\p{L}\p{N}._:/#-]*/gu) || [];
}

/**
 * A verifiable criterion names a concrete outcome or check. It must be more
 * than a placeholder, but it stays deliberately permissive: the owner can
 * write short criteria such as "Search works" or "pnpm test passes".
 */
export function isVerifiableAcceptanceCriterion(value: unknown): boolean {
  const criterion = collapse(value);
  if (criterion.length < MIN_CRITERION_LENGTH) return false;
  if (NON_VERIFIABLE.has(criterion.toLowerCase())) return false;
  return words(criterion).length >= 2;
}

export function normalizeAcceptanceCriteria(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const criteria: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const criterion = collapse(value).slice(0, MAX_CRITERION_LENGTH);
    if (!isVerifiableAcceptanceCriterion(criterion)) continue;
    const key = criterion.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    criteria.push(criterion);
    if (criteria.length >= MAX_CRITERIA) break;
  }
  return criteria;
}

function asSentence(value: string): string {
  return `${collapse(value)}.`;
}

function unique(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = collapse(value).slice(0, 180);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function firstUsable(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const candidate = collapse(value);
    if (
      candidate.length >= MIN_GOAL_LENGTH &&
      words(candidate).length >= 2 &&
      !NON_GOALS.has(candidate.toLowerCase())
    ) {
      return candidate;
    }
  }
  return null;
}

function unavailableReason(): string {
  return `The task has no concrete goal or expected behaviour that can be turned into verifiable acceptance criteria. Add at least one measurable outcome or check before queueing.`;
}

/**
 * Resolve owner-provided criteria when they are verifiable; otherwise derive
 * criteria from the goal, the declared components and the expected behaviour.
 * The function never invents evidence: if the task text is too vague it returns
 * no criteria and a human-readable reason instead of weakening the queue gate.
 */
export function generateAcceptanceCriteria(
  input: AcceptanceCriteriaInput
): AcceptanceCriteriaResolution {
  const provided = normalizeAcceptanceCriteria(input.acceptanceCriteria);
  if (provided.length > 0) {
    return { criteria: provided, derivation: 'provided', reason: null };
  }

  const objective = collapse(input.objective);
  const required = collapse(input.requiredBehavior);
  const title = collapse(input.title);
  const goal = firstUsable([objective, required, title]);
  if (!goal) {
    return { criteria: [], derivation: 'unavailable', reason: unavailableReason() };
  }

  const files = unique(input.affectedFiles || [], MAX_COMPONENTS);
  const components =
    files.length > 0
      ? files
      : unique(
          [
            ...(input.backendChanges || []),
            ...(input.frontendChanges || []),
            ...(input.databaseChanges || []),
            ...(input.mobileChanges || []),
          ],
          MAX_COMPONENTS
        );
  const checks = unique(input.tests || [], MAX_CHECKS);
  const goalKey = goal.toLowerCase();
  const requiredKey = required.toLowerCase();

  const criteria: string[] = [`The task goal is met: ${asSentence(goal)}`];

  if (required && requiredKey !== goalKey) {
    criteria.push(`The expected behaviour is observable: ${asSentence(required)}`);
  }

  if (components.length > 0) {
    criteria.push(`The change is limited to the declared components: ${components.join(', ')}.`);
  } else {
    criteria.push(
      'The diff stays within the modules named in the goal; any additional file is justified in the hand-off.'
    );
  }

  if (checks.length > 0) {
    criteria.push(
      `The listed checks pass: ${checks.join(', ')}; any check that was not run is reported as not run.`
    );
  } else {
    criteria.push(
      'Relevant lint, typecheck and tests pass, or the hand-off states exactly which checks were not run.'
    );
  }

  criteria.push(
    'The hand-off lists every changed file, every command result and any remaining limitation.'
  );

  return {
    criteria: criteria.slice(0, MAX_CRITERIA),
    derivation: 'generated',
    reason: null,
  };
}

/** True when at least one stored criterion can actually be verified. */
export function hasVerifiableAcceptanceCriteria(values: unknown): boolean {
  return normalizeAcceptanceCriteria(values).length > 0;
}
