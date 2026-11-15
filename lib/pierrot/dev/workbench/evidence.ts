import { assertServerOnly } from '@/lib/serverOnly';
import { getCheckRuns } from '../repository';
import { computeVerdict, evaluateCriterion } from './state';
import type { DevAttempt, DevReviewView } from './types';

assertServerOnly('lib/pierrot/dev/workbench/evidence');

const FAILED_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
]);

export type AttemptEvidence = {
  criteria: DevReviewView['criteria'];
  ciRuns: Array<{ name: string; status: string | null; conclusion: string | null; url: string | null }>;
  ciPassed: boolean;
  ciFailed: boolean;
  localReportedPassed: boolean;
  localReportedFailed: boolean;
  localTrusted: boolean;
  changedFiles: string[];
  manualAll: boolean;
  verdict: 'verified' | 'verified_with_warnings' | 'not_verified' | 'rejected';
  hasBlocker: boolean;
  hasHighFinding: boolean;
  blockingReasons: string[];
};

/**
 * Collect real evidence for an attempt. Rules:
 * - CI success/failure comes from GitHub check runs for the exact head SHA.
 * - Executor-reported commands are self-reported and are not proof unless the
 *   server explicitly enables PIERROT_DEV_TRUST_SELF_REPORTED_CHECKS.
 * - A changed filename is never proof of a behavioural criterion.
 * - Missing evidence is reported as not_verified, never as success.
 */
export async function collectAttemptEvidence(input: {
  task: {
    id: string;
    repository: string;
    acceptanceCriteria: string[];
  };
  attempt: DevAttempt | null;
  manualCriteria?: string[];
  /** Union of worker-reported and GitHub-diff files. */
  changedFiles?: string[];
  /** Pre-fetched CI results (avoids a second GitHub call in review). */
  ciChecks?: AttemptEvidence['ciRuns'];
}): Promise<AttemptEvidence> {
  const changedFiles = input.changedFiles || input.attempt?.changedFiles || [];
  const ciRuns: AttemptEvidence['ciRuns'] = [];
  let ciPassed = false;
  let ciFailed = false;

  const headSha = input.attempt?.headSha;
  if (input.ciChecks) {
    for (const run of input.ciChecks) {
      ciRuns.push(run);
      if (run.conclusion && FAILED_CONCLUSIONS.has(run.conclusion)) ciFailed = true;
      if (run.conclusion === 'success') ciPassed = true;
    }
  } else if (input.attempt && headSha) {
    try {
      const data = await getCheckRuns({
        repository: input.task.repository,
        ref: headSha,
        limit: 40,
      });
      for (const run of data.checks) {
        ciRuns.push({
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          url: run.url,
        });
        if (run.conclusion && FAILED_CONCLUSIONS.has(run.conclusion)) ciFailed = true;
        if (run.conclusion === 'success') ciPassed = true;
      }
    } catch {
      // CI unavailability is reported as "no CI evidence", never as success.
    }
  }

  const commands = input.attempt?.commands || [];
  const localReportedPassed = commands.some((command) => command.status === 'passed');
  const localReportedFailed = commands.some((command) => command.status === 'failed');
  const localTrusted =
    process.env.PIERROT_DEV_TRUST_SELF_REPORTED_CHECKS === 'true' && localReportedPassed;

  const manualSet = new Set((input.manualCriteria || []).map((item) => item.trim()));
  const manualAll =
    manualSet.has('*') ||
    (input.task.acceptanceCriteria.length > 0 &&
      input.task.acceptanceCriteria.every((criterion) => manualSet.has(criterion)));

  const criteria = input.task.acceptanceCriteria.map((criterion) =>
    evaluateCriterion({
      criterion,
      changedFiles,
      localChecksPassed: localTrusted,
      localChecksFailed: localTrusted && localReportedFailed,
      ciPassed,
      ciFailed,
      manualConfirmed: manualSet.has('*') || manualSet.has(criterion),
    })
  );

  const blockingReasons: string[] = [];
  if (!input.attempt) blockingReasons.push('No execution attempt exists for this task.');
  if (input.attempt && input.attempt.status !== 'completed') {
    blockingReasons.push(`The latest attempt is ${input.attempt.status}, not completed.`);
  }
  if (changedFiles.length === 0) blockingReasons.push('No changed files were recorded.');
  if (ciFailed) blockingReasons.push('At least one CI check failed.');
  if (!ciPassed && !manualAll && !localTrusted) {
    blockingReasons.push(
      'No passing CI check and no explicit manual confirmation of the acceptance criteria.'
    );
  }
  if (criteria.some((criterion) => criterion.status === 'failed')) {
    blockingReasons.push('At least one acceptance criterion is failed.');
  }
  if (criteria.some((criterion) => criterion.status === 'not_verified') && !manualAll) {
    blockingReasons.push('Some acceptance criteria are not verified.');
  }

  const hasHighFinding = !ciPassed && !manualAll;

  const verdict = computeVerdict({
    hasChanges: changedFiles.length > 0,
    hasBlocker: Boolean(input.attempt && input.attempt.status !== 'completed'),
    hasHighFinding,
    localChecksPassed: localTrusted,
    localChecksFailed: localTrusted && localReportedFailed,
    ciPassed,
    ciFailed,
    manualAll,
    criteria,
  });

  return {
    criteria,
    ciRuns,
    ciPassed,
    ciFailed,
    localReportedPassed,
    localReportedFailed,
    localTrusted,
    changedFiles,
    manualAll,
    verdict,
    hasBlocker: blockingReasons.length > 0,
    hasHighFinding,
    blockingReasons,
  };
}
