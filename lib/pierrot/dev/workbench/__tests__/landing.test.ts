/** @jest-environment node */

import {
  blockingLandingRisks,
  canMarkLanded,
  detectLandingRisks,
  formatLandingRiskReason,
  sameCommitSha,
} from '../landing';

const HEAD = 'a'.repeat(40);

describe('landing safety gate', () => {
  it('allows an ordinary code and documentation change', () => {
    const risks = detectLandingRisks([
      { filename: 'lib/pierrot/example.ts', status: 'modified', additions: 20, deletions: 3 },
      { filename: 'docs/example.md', status: 'added', additions: 50, deletions: 0 },
      {
        filename: 'migrations/2026-12-20_additive.sql',
        status: 'added',
        patch: '+CREATE TABLE public.example (id UUID);',
      },
    ]);
    expect(blockingLandingRisks(risks)).toHaveLength(0);
    // A migration is still recorded as security-sensitive evidence.
    expect(risks.some((risk) => risk.code === 'SECURITY_SENSITIVE_PATH')).toBe(true);
  });

  it('blocks secret-like files and provider credentials', () => {
    const risks = detectLandingRisks([
      { filename: '.env.production', status: 'modified' },
      { filename: 'config/secrets.json', status: 'added' },
      {
        filename: 'lib/example.ts',
        status: 'modified',
        patch: '+const token = "-----BEGIN RSA PRIVATE KEY-----";',
      },
    ]);
    const blocking = blockingLandingRisks(risks).map((risk) => risk.code);
    expect(blocking).toContain('SECRET_FILE_CHANGED');
    expect(blocking).toContain('PRIVATE_KEY_MATERIAL');
  });

  it('blocks destructive SQL but allows additive DDL', () => {
    const destructive = detectLandingRisks([
      {
        filename: 'migrations/2026-12-20_drop.sql',
        patch: '+DROP TABLE public.orders;',
      },
      {
        filename: 'migrations/2026-12-21_delete.sql',
        patch: '+DELETE FROM public.orders;',
      },
    ]);
    expect(blockingLandingRisks(destructive).map((risk) => risk.code)).toContain('DESTRUCTIVE_SQL');

    const safe = detectLandingRisks([
      {
        filename: 'migrations/2026-12-22_safe.sql',
        patch: '+DELETE FROM public.orders WHERE archived = true;',
      },
    ]);
    expect(blockingLandingRisks(safe)).toHaveLength(0);
  });

  it('blocks CI workflow changes so a task cannot weaken its own proof', () => {
    const risks = detectLandingRisks([
      { filename: '.github/workflows/ci.yml', status: 'modified', patch: '- pnpm test' },
    ]);
    expect(blockingLandingRisks(risks)).toHaveLength(1);
    expect(formatLandingRiskReason(blockingLandingRisks(risks))).toMatch(/CI_WORKFLOW_CHANGED/);
  });

  it('requires a merged PR with passed CI for the exact head SHA', () => {
    expect(
      canMarkLanded({ merged: true, ciStatus: 'passed', headSha: HEAD, expectedHeadSha: HEAD })
    ).toBe(true);
    expect(
      canMarkLanded({ merged: false, ciStatus: 'passed', headSha: HEAD, expectedHeadSha: HEAD })
    ).toBe(false);
    expect(
      canMarkLanded({ merged: true, ciStatus: 'pending', headSha: HEAD, expectedHeadSha: HEAD })
    ).toBe(false);
    expect(
      canMarkLanded({
        merged: true,
        ciStatus: 'passed',
        headSha: HEAD,
        expectedHeadSha: 'b'.repeat(40),
      })
    ).toBe(false);
    expect(sameCommitSha(HEAD.toUpperCase(), HEAD.slice(0, 7))).toBe(true);
  });
});
