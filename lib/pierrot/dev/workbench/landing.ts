/**
 * Pre-merge landing safety gate.
 *
 * Automatic landing may only merge a pull request when real CI is green for the
 * exact head SHA and nothing in the diff is a destructive or security-sensitive
 * operation. This module is deliberately pure so the rules can be unit-tested
 * without GitHub or Supabase.
 *
 * The rules are intentionally conservative. A blocked task is never merged and
 * never marked complete; it keeps its PR link, attempts, notes and reports for a
 * later explicit decision. Warnings are recorded but do not block landing.
 */

export type LandingRiskSeverity = 'blocking' | 'warning';

export type LandingRiskCode =
  | 'SECRET_FILE_CHANGED'
  | 'PRIVATE_KEY_MATERIAL'
  | 'DESTRUCTIVE_SQL'
  | 'CI_WORKFLOW_CHANGED'
  | 'SECURITY_SENSITIVE_PATH'
  | 'LARGE_PURE_DELETION';

export type LandingRisk = {
  code: LandingRiskCode;
  severity: LandingRiskSeverity;
  reason: string;
  files: string[];
};

export type LandingFile = {
  filename: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string | null;
};

const SECRET_FILE_PATTERN =
  /(^|\/)(\.env(\..*)?|\.npmrc|\.pypirc|id_rsa|id_dsa|id_ecdsa|id_ed25519|.*\.pem|.*\.p12|.*\.pfx|credentials?(\..*)?|secrets?(\..*)?|service[-_.]?account(\..*)?)$/i;

const PRIVATE_KEY_PATTERN =
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----|SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+|PIERROT_DEV_WORKER_TOKEN\s*=\s*\S+|DEEPSEEK_API_KEY\s*=\s*\S+/i;

const CI_PATH_PATTERN = /^\.github\/(workflows|actions)\//i;

const SECURITY_PATH_PATTERN =
  /(^|\/)(middleware\.(ts|js)|lib\/serverAuth\.ts|lib\/auth\/|lib\/security\/|lib\/pierrot\/dev\/workbench\/(workerAuth|github)\.ts|migrations?\/|supabase\/)/i;

const SQL_PATH_PATTERN = /(^|\/)(migrations?|sql|supabase)\/|\.sql$/i;

const DESTRUCTIVE_SQL_PATTERN =
  /\b(?:DROP\s+(?:TABLE|COLUMN|SCHEMA|DATABASE|POLICY|FUNCTION|INDEX)|TRUNCATE\s+(?:TABLE\s+)?[A-Za-z0-9_."]+|ALTER\s+TABLE\s+[A-Za-z0-9_."]+\s+DROP\s+COLUMN)\b/i;

const DELETE_PATTERN = /\bDELETE\s+FROM\s+[A-Za-z0-9_."]+/gi;

function normalized(path: string): string {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .trim();
}

function uniqueFiles(files: string[]): string[] {
  return [...new Set(files.filter(Boolean))].slice(0, 20);
}

function hasDestructiveDelete(patch: string): boolean {
  for (const match of patch.matchAll(DELETE_PATTERN)) {
    const tail = patch.slice(match.index ?? 0, (match.index ?? 0) + 800);
    if (!/\bWHERE\b/i.test(tail)) return true;
  }
  return false;
}

/**
 * Inspect the files a PR changes and return every landing risk.
 *
 * Blocking risks stop automatic landing for that task with a precise reason.
 * Warnings are recorded as evidence only.
 */
export function detectLandingRisks(files: LandingFile[]): LandingRisk[] {
  const risks: LandingRisk[] = [];
  const secretFiles: string[] = [];
  const keyFiles: string[] = [];
  const destructiveFiles: string[] = [];
  const ciFiles: string[] = [];
  const sensitiveFiles: string[] = [];
  const largeDeletions: string[] = [];

  for (const file of files) {
    const path = normalized(file.filename);
    if (!path) continue;
    const patch = typeof file.patch === 'string' ? file.patch : '';
    if (SECRET_FILE_PATTERN.test(path)) secretFiles.push(path);
    if (patch && PRIVATE_KEY_PATTERN.test(patch)) keyFiles.push(path);
    if (CI_PATH_PATTERN.test(path)) ciFiles.push(path);
    if (SECURITY_PATH_PATTERN.test(path) && !CI_PATH_PATTERN.test(path)) sensitiveFiles.push(path);
    if (SQL_PATH_PATTERN.test(path) && patch) {
      if (DESTRUCTIVE_SQL_PATTERN.test(patch) || hasDestructiveDelete(patch)) {
        destructiveFiles.push(path);
      }
    }
    const additions = Number(file.additions || 0);
    const deletions = Number(file.deletions || 0);
    if (deletions > 500 && additions === 0) largeDeletions.push(path);
  }

  if (secretFiles.length > 0) {
    risks.push({
      code: 'SECRET_FILE_CHANGED',
      severity: 'blocking',
      reason:
        'The diff changes a secret or credential-like file. Secrets must never land automatically.',
      files: uniqueFiles(secretFiles),
    });
  }
  if (keyFiles.length > 0) {
    risks.push({
      code: 'PRIVATE_KEY_MATERIAL',
      severity: 'blocking',
      reason: 'The diff contains private key material or a committed provider/service credential.',
      files: uniqueFiles(keyFiles),
    });
  }
  if (destructiveFiles.length > 0) {
    risks.push({
      code: 'DESTRUCTIVE_SQL',
      severity: 'blocking',
      reason:
        'The diff contains destructive SQL (DROP, TRUNCATE or DELETE without WHERE). It must not land automatically.',
      files: uniqueFiles(destructiveFiles),
    });
  }
  if (ciFiles.length > 0) {
    risks.push({
      code: 'CI_WORKFLOW_CHANGED',
      severity: 'blocking',
      reason:
        'The diff changes the CI workflow that proves the merge is safe. Required checks must be changed outside automatic landing.',
      files: uniqueFiles(ciFiles),
    });
  }
  if (sensitiveFiles.length > 0) {
    risks.push({
      code: 'SECURITY_SENSITIVE_PATH',
      severity: 'warning',
      reason:
        'The diff touches authentication, security, RLS or migration files. CI evidence still decides the merge; the changed area is recorded for audit.',
      files: uniqueFiles(sensitiveFiles),
    });
  }
  if (largeDeletions.length > 0) {
    risks.push({
      code: 'LARGE_PURE_DELETION',
      severity: 'warning',
      reason: 'One or more files are deleted without replacement. Recorded for audit.',
      files: uniqueFiles(largeDeletions),
    });
  }

  return risks;
}

export type LandingRiskLike = {
  code: string;
  severity: 'blocking' | 'warning';
  reason: string;
  files: string[];
};

export function blockingLandingRisks<T extends LandingRiskLike>(risks: T[]): T[] {
  return risks.filter((risk) => risk.severity === 'blocking');
}

export function formatLandingRiskReason(risks: LandingRiskLike[]): string {
  return risks
    .map((risk) => {
      const files = risk.files.length > 0 ? ` (${risk.files.join(', ')})` : '';
      return `${risk.code}: ${risk.reason}${files}`;
    })
    .join(' ');
}

/** Compare two SHAs without trusting case or abbreviated values. */
export function sameCommitSha(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(left) || !/^[0-9a-f]{7,40}$/.test(right)) return false;
  return left.startsWith(right) || right.startsWith(left);
}

/**
 * Landing is complete only when GitHub reports the PR merged AND real CI passed
 * for the head that was merged. Integration alone never proves completion.
 */
export function canMarkLanded(input: {
  merged: boolean;
  ciStatus: string | null | undefined;
  headSha: string | null | undefined;
  expectedHeadSha: string | null | undefined;
}): boolean {
  return (
    input.merged === true &&
    input.ciStatus === 'passed' &&
    Boolean(input.headSha) &&
    sameCommitSha(input.headSha, input.expectedHeadSha)
  );
}
