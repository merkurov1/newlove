import { assertServerOnly } from '@/lib/serverOnly';
import { compareRefs, getCheckRuns, getPullRequest } from './repository';
import { resolveDevRepository } from './repositories';
import { getDevTask, saveDevTaskReview } from './tasks';
import { collectAttemptEvidence } from './workbench/evidence';
import { getPullRequestStatus } from './workbench/github';
import { computeVerdict } from './workbench/state';
import type { DevAttempt } from './workbench/types';
import type { DevReviewFinding, DevReviewReport, DevTask } from './types';

assertServerOnly('lib/pierrot/dev/review');

function pullRequestNumber(task: DevTask): number | null {
  for (const url of task.pullRequests) {
    const match = String(url).match(/\/pull\/(\d+)(?:$|[/?#])/);
    if (match) return Number(match[1]);
  }
  return null;
}

function isMigrationFile(path: string): boolean {
  return /(^|\/)migrations?\//i.test(path) || /\.sql$/i.test(path);
}

function isSensitiveFile(path: string): boolean {
  return /(^|\/)(\.env|\.env\..+|secrets?|credentials?|id_rsa|.*\.pem)$/i.test(path);
}

export async function reviewDevTask(
  userId: string,
  taskId: string,
  input: { head?: string; base?: string; attempt?: DevAttempt | null } = {}
): Promise<{ task: DevTask; report: DevReviewReport } | null> {
  const task = await getDevTask(userId, taskId);
  if (!task) return null;

  const config = resolveDevRepository(task.repository);
  const configuredBase = input.base || task.baseCommit || task.baseRef || config.defaultBranch;

  // A merged PR's result_commit is the merge commit already contained in main.
  // Comparing main...merge_commit is empty and used to produce a false
  // "no changes" verdict. Read the merged PR's own files and head SHA instead.
  const prNumber = pullRequestNumber(task);
  let mergedPr: Awaited<ReturnType<typeof getPullRequestStatus>> = null;
  let mergedPrFiles: Awaited<ReturnType<typeof getPullRequest>>['files'] | null = null;
  if (prNumber) {
    try {
      const status = await getPullRequestStatus(config.key, prNumber);
      if (status?.merged) {
        mergedPr = status;
        try {
          const pr = await getPullRequest({
            repository: config.key,
            number: prNumber,
            includeFiles: true,
          });
          mergedPrFiles = pr.files;
        } catch {
          mergedPrFiles = null;
        }
      }
    } catch {
      mergedPr = null;
    }
  }

  const base = mergedPr?.baseBranch || configuredBase;
  const head =
    mergedPr?.headSha || input.head || task.resultCommit || config.workBranch;
  const generatedAt = new Date().toISOString();
  const findings: DevReviewFinding[] = [];
  const limitations: string[] = [
    'Pierrot did not execute the tests itself. CI check runs and executor-reported commands are shown separately.',
    'Executor-reported commands are self-reported unless the server enables PIERROT_DEV_TRUST_SELF_REPORTED_CHECKS.',
    'A commit or pull request is not proof that the task is complete.',
    'GitHub diff data may be truncated for large changes.',
  ];

  let compare:
    | Awaited<ReturnType<typeof compareRefs>>
    | null = null;
  let compareError: string | null = null;

  if (!mergedPr) {
    try {
      compare = await compareRefs({
        repository: config.key,
        base,
        head,
      });
    } catch (error) {
      compareError = error instanceof Error ? error.message : 'Diff comparison failed.';
      findings.push({
        severity: 'blocker',
        file: null,
        line: null,
        problem: `Unable to compare ${base}...${head}: ${compareError}`,
        impact: 'The actual result cannot be verified.',
        recommendation: 'Check repository access, refs and the result commit SHA, then retry.',
      });
    }
  }

  let checksData:
    | Awaited<ReturnType<typeof getCheckRuns>>
    | null = null;
  let checksError: string | null = null;

  try {
    checksData = await getCheckRuns({
      repository: config.key,
      ref: head,
      limit: 30,
    });
  } catch (error) {
    checksError = error instanceof Error ? error.message : 'Check runs unavailable.';
    limitations.push(`Check runs unavailable: ${checksError}`);
  }

  const changedFiles = mergedPrFiles || compare?.files || [];
  const hasChanges = changedFiles.length > 0;
  const checkRuns = checksData?.checks || [];

  const attempt: DevAttempt | null = input.attempt || null;
  const evidence = await collectAttemptEvidence({
    task: {
      id: task.id,
      repository: task.repository,
      acceptanceCriteria: task.acceptanceCriteria,
    },
    attempt,
    changedFiles: [
      ...new Set([...(attempt?.changedFiles || []), ...changedFiles.map((file) => file.filename)]),
    ],
    ciChecks: checkRuns.map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      url: run.url,
    })),
  });
  const testsExecuted = evidence.ciPassed || evidence.localTrusted;

  if (!hasChanges) {
    findings.push({
      severity: 'high',
      file: null,
      line: null,
      problem: 'No changed files were found between the task base and the review head.',
      impact: 'There is no evidence that the task was implemented.',
      recommendation:
        'Attach the correct result commit or branch, or implement the task before requesting review.',
    });
  }

  if (head === config.defaultBranch) {
    findings.push({
      severity: 'blocker',
      file: null,
      line: null,
      problem: `The review head is the default branch (${config.defaultBranch}).`,
      impact: 'Changes may have been written directly to the protected branch.',
      recommendation:
        'Move the work to a separate branch and review the branch diff instead.',
    });
  }

  if (evidence.ciFailed) {
    findings.push({
      severity: 'blocker',
      file: null,
      line: null,
      problem: 'At least one CI check run for the review head concluded with a failure.',
      impact: 'The result does not pass the real checks.',
      recommendation: 'Fix the failing check and push a new commit to the working branch.',
    });
  }

  if (evidence.localReportedFailed) {
    findings.push({
      severity: 'high',
      file: null,
      line: null,
      problem: 'The executor reported at least one failed verification command.',
      impact: 'A failure cannot be masked by a successful completion message.',
      recommendation:
        'Inspect the command output in HISTORY and retry the task or confirm the result manually with evidence.',
    });
  }

  if (!testsExecuted) {
    findings.push({
      severity: 'high',
      file: null,
      line: null,
      problem: evidence.localReportedPassed
        ? 'Only executor-reported command results are available. No CI check run passed.'
        : 'No executed test or build check run was found for the review head.',
      impact:
        'Correctness, regressions and the acceptance criteria are not independently verified.',
      recommendation:
        'Attach a passing CI check, or confirm the criteria manually in Admin after inspecting the result.',
    });
  }

  if (
    task.databaseChanges.length > 0 &&
    !changedFiles.some((file) => isMigrationFile(file.filename))
  ) {
    findings.push({
      severity: 'high',
      file: null,
      line: null,
      problem: 'The task declares database changes, but the diff contains no migration.',
      impact: 'Production schema may diverge from the repository.',
      recommendation:
        'Add an additive migration, document manual application and include RLS/compatibility checks.',
    });
  }

  if (
    (task.backendChanges.length > 0 || task.frontendChanges.length > 0) &&
    hasChanges &&
    !changedFiles.some(
      (file) =>
        file.filename.startsWith('lib/') ||
        file.filename.startsWith('app/') ||
        file.filename.startsWith('components/') ||
        file.filename.startsWith('scripts/')
    )
  ) {
    findings.push({
      severity: 'medium',
      file: null,
      line: null,
      problem:
        'The task declares backend/frontend changes, but the diff touches no application source paths.',
      impact: 'The implementation may be incomplete or attached to the wrong commit.',
      recommendation: 'Confirm the changed files and attach the correct result.',
    });
  }

  const sensitive = changedFiles.find((file) => isSensitiveFile(file.filename));
  if (sensitive) {
    findings.push({
      severity: 'high',
      file: sensitive.filename,
      line: null,
      problem: 'The diff modifies a secret-like file.',
      impact: 'Credentials or private configuration may be exposed.',
      recommendation:
        'Remove secrets from the repository, rotate exposed values and use environment variables.',
    });
  }

  for (const file of changedFiles) {
    if (file.patchTruncated) {
      findings.push({
        severity: 'low',
        file: file.filename,
        line: null,
        problem: 'The diff for this file was truncated.',
        impact: 'Part of the change was not reviewed.',
        recommendation: 'Inspect the full file or commit manually.',
      });
    }
  }

  if (compare?.truncated) {
    findings.push({
      severity: 'low',
      file: null,
      line: null,
      problem: 'GitHub returned a truncated file list for this comparison.',
      impact: 'Some changed files may not have been reviewed.',
      recommendation: 'Review the remaining files directly through the commit or PR.',
    });
  }

  const acceptanceCriteria = evidence.criteria;
  const unverifiedCriteria = acceptanceCriteria.filter(
    (criterion) => criterion.status !== 'satisfied'
  ).length;

  const failedCriteria = acceptanceCriteria.filter(
    (criterion) => criterion.status === 'failed'
  ).length;
  if (failedCriteria > 0) {
    findings.push({
      severity: 'blocker',
      file: null,
      line: null,
      problem: `${failedCriteria} acceptance criteria failed.`,
      impact: 'The result does not satisfy the task.',
      recommendation: 'Fix the failed criteria and re-run the review.',
    });
  } else if (unverifiedCriteria > 0 && hasChanges) {
    findings.push({
      severity: 'medium',
      file: null,
      line: null,
      problem: `${unverifiedCriteria} acceptance criteria have no real evidence yet.`,
      impact: 'The task cannot be marked verified without evidence or manual confirmation.',
      recommendation:
        'Attach passing CI checks, or confirm each criterion manually after inspecting the result in Admin.',
    });
  }

  const verdict = computeVerdict({
    hasChanges,
    hasBlocker: findings.some((finding) => finding.severity === 'blocker'),
    hasHighFinding: findings.some((finding) => finding.severity === 'high'),
    localChecksPassed: evidence.localTrusted,
    localChecksFailed: evidence.localTrusted && evidence.localReportedFailed,
    ciPassed: evidence.ciPassed,
    ciFailed: evidence.ciFailed,
    criteria: acceptanceCriteria,
  });
  const summaryParts = [
    `Compared ${base}...${head} in ${config.fullName}.`,
    hasChanges
      ? `${changedFiles.length} changed file(s) were found.`
      : 'No changed files were found.',
    evidence.ciPassed
      ? 'A CI check run passed for the review head.'
      : 'No passing CI check run was found.',
    evidence.localReportedPassed
      ? evidence.localTrusted
        ? 'Executor-reported local checks are trusted by server policy.'
        : 'Executor-reported local checks exist but are self-reported and are not treated as proof.'
      : 'No local check results were reported.',
    `Verdict: ${verdict}.`,
  ];

  const report: DevReviewReport = {
    taskId: task.id,
    repository: config.fullName,
    baseRef: base,
    headRef: head,
    baseCommit: compare?.base || null,
    headCommit: compare?.commitSha || checksData?.commitSha || null,
    verdict,
    summary: summaryParts.join(' '),
    changedFiles: changedFiles.map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch,
      patchTruncated: file.patchTruncated,
    })),
    findings,
    checks: {
      available: Boolean(checksData),
      testsExecuted,
      runs: checkRuns.map((run) => ({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        url: run.url,
      })),
      note: evidence.ciPassed
        ? 'CI check runs are real evidence. They still do not prove that behavioural acceptance criteria are correct.'
        : 'No passing CI check run was attached. Executor-reported local commands are self-reported and are not treated as proof.',
    },
    acceptanceCriteria,
    generatedAt,
    limitations,
  };

  const updated = await saveDevTaskReview({
    userId,
    taskId,
    report,
  });

  return {
    task: updated || task,
    report,
  };
}

export function formatReviewMarkdown(report: DevReviewReport): string {
  const lines: string[] = [
    `# Engineering review — ${report.verdict}`,
    '',
    report.summary,
    '',
    `Repository: ${report.repository}`,
    `Base: ${report.baseRef}`,
    `Head: ${report.headRef}`,
    '',
    '## Changed files',
    '',
    ...(report.changedFiles.length > 0
      ? report.changedFiles.map(
          (file) =>
            `- \`${file.filename}\` (${file.status}, +${file.additions}/-${file.deletions})`
        )
      : ['No changed files.']),
    '',
    '## Findings',
    '',
    ...(report.findings.length > 0
      ? report.findings.map(
          (finding) =>
            `- **${finding.severity}** ${finding.file || 'general'}${
              finding.line ? `:${finding.line}` : ''
            } — ${finding.problem}\n  - Impact: ${finding.impact}\n  - Fix: ${finding.recommendation}`
        )
      : ['No findings.']),
    '',
    '## Acceptance criteria',
    '',
    ...report.acceptanceCriteria.map(
      (criterion) =>
        `- [${criterion.status}] ${criterion.criterion} — ${criterion.evidence}`
    ),
    '',
    '## Checks',
    '',
    report.checks.note,
    '',
    ...report.checks.runs.map(
      (run) => `- ${run.name}: ${run.status || 'unknown'}/${run.conclusion || 'unknown'}`
    ),
    '',
    '## Limitations',
    '',
    ...report.limitations.map((item) => `- ${item}`),
  ];

  return lines.join('\n');
}
