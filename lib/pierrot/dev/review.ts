import { assertServerOnly } from '@/lib/serverOnly';
import { compareRefs, getCheckRuns } from './repository';
import { resolveDevRepository } from './repositories';
import { getDevTask, saveDevTaskReview } from './tasks';
import type {
  DevReviewFinding,
  DevReviewReport,
  DevTask,
  DevVerificationStatus,
} from './types';

assertServerOnly('lib/pierrot/dev/review');

function isMigrationFile(path: string): boolean {
  return /(^|\/)migrations?\//i.test(path) || /\.sql$/i.test(path);
}

function isSensitiveFile(path: string): boolean {
  return /(^|\/)(\.env|\.env\..+|secrets?|credentials?|id_rsa|.*\.pem)$/i.test(path);
}

function criterionEvidence(
  criterion: string,
  changedFiles: string[],
  testsExecuted: boolean
): { evidence: string; status: 'satisfied' | 'not_verified' | 'failed' } {
  const lower = criterion.toLowerCase();

  const mentionedPath = changedFiles.find((file) => {
    const normalized = file.toLowerCase();
    const basename = normalized.split('/').pop() || normalized;
    return (
      lower.includes(normalized) ||
      (basename.length >= 4 && lower.includes(basename))
    );
  });

  if (mentionedPath) {
    return {
      evidence: `Changed file matches the criterion: ${mentionedPath}. Manual review is still required.`,
      status: 'satisfied',
    };
  }

  if (/(test|tests|тест|сборк|build|lint|typecheck)/i.test(criterion)) {
    return testsExecuted
      ? {
          evidence: 'A test/build check run is attached to the head commit.',
          status: 'satisfied',
        }
      : {
          evidence: 'No test or build check run was found for the head commit.',
          status: 'not_verified',
        };
  }

  return {
    evidence:
      'The diff alone cannot prove this criterion. It requires a manual check or a recorded test result.',
    status: 'not_verified',
  };
}

function verdictFromFindings(
  findings: DevReviewFinding[],
  testsExecuted: boolean,
  hasChanges: boolean
): DevVerificationStatus {
  if (findings.some((finding) => finding.severity === 'blocker')) return 'rejected';
  if (!hasChanges) return 'not_verified';
  if (!testsExecuted) return 'not_verified';
  if (
    findings.some(
      (finding) => finding.severity === 'high' || finding.severity === 'medium'
    )
  ) {
    return 'verified_with_warnings';
  }
  return 'verified';
}

export async function reviewDevTask(
  userId: string,
  taskId: string,
  input: { head?: string; base?: string } = {}
): Promise<{ task: DevTask; report: DevReviewReport } | null> {
  const task = await getDevTask(userId, taskId);
  if (!task) return null;

  const config = resolveDevRepository(task.repository);
  const base = input.base || task.baseCommit || task.baseRef || config.defaultBranch;
  const head = input.head || task.resultCommit || config.workBranch;
  const generatedAt = new Date().toISOString();
  const findings: DevReviewFinding[] = [];
  const limitations: string[] = [
    'Pierrot did not execute tests locally. Only GitHub check runs and workflow metadata were inspected.',
    'A commit or pull request is not proof that the task is complete.',
    'GitHub diff data may be truncated for large changes.',
  ];

  let compare:
    | Awaited<ReturnType<typeof compareRefs>>
    | null = null;
  let compareError: string | null = null;

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

  const changedFiles = compare?.files || [];
  const hasChanges = changedFiles.length > 0;
  const checkRuns = checksData?.checks || [];
  const testsExecuted = checkRuns.some(
    (run) =>
      /(test|tests|ci|build|lint|typecheck|verify)/i.test(run.name) &&
      Boolean(run.conclusion)
  );

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

  if (!testsExecuted) {
    findings.push({
      severity: 'high',
      file: null,
      line: null,
      problem: 'No executed test or build check run was found for the review head.',
      impact:
        'Correctness, regressions and the acceptance criteria are not verified.',
      recommendation:
        'Run the relevant lint, typecheck, tests and build, attach the command output, and re-run this review.',
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

  const acceptanceCriteria = task.acceptanceCriteria.map((criterion) => ({
    criterion,
    ...criterionEvidence(
      criterion,
      changedFiles.map((file) => file.filename),
      testsExecuted
    ),
  }));

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
  }

  const verdict = verdictFromFindings(findings, testsExecuted, hasChanges);
  const summaryParts = [
    `Compared ${base}...${head} in ${config.fullName}.`,
    hasChanges
      ? `${changedFiles.length} changed file(s) were found.`
      : 'No changed files were found.',
    testsExecuted
      ? 'CI check runs were found, but Pierrot did not execute them.'
      : 'No executed test/build check run was found.',
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
      note: testsExecuted
        ? 'GitHub check runs are evidence of CI; they are not proof that the task acceptance criteria are correct.'
        : 'No executed test or build check run was attached. Tests are explicitly unverified.',
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
