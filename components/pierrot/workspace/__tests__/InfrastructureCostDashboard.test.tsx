import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyCommercialSummary } from '@/lib/pierrot/commercialSummary';
import { buildCostReport } from '@/lib/infrastructure/calculator';
import { scenarioPreset } from '@/lib/infrastructure/scenarios';
import { buildDevLedgerBridge } from '@/lib/infrastructure/selfFunding';
import InfrastructureCostDashboard from '../InfrastructureCostDashboard';

jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/pierrot/infrastructure',
}));

describe('InfrastructureCostDashboard', () => {
  it('renders the overview, scenario controls, cost lines and Self-Funding without a billing API', () => {
    const initialReport = buildCostReport({ scenario: scenarioPreset('comfortable') });
    const html = renderToStaticMarkup(
      <InfrastructureCostDashboard
        initialReport={initialReport}
        actuals={[
          {
            provider: 'vercel',
            providerLabel: 'Vercel',
            status: 'not-configured',
            source: 'vercel-billing-api',
            checkedAt: '2026-11-18T00:00:00.000Z',
            actualChargeEur: null,
            usageSummary: null,
            reason: 'Billing API не подключён.',
            requiredPermission: 'Read-only billing access.',
          },
        ]}
        commercial={emptyCommercialSummary('last_30_days', new Date('2026-11-18'))}
        devBridge={buildDevLedgerBridge(null)}
      />
    );

    expect(html).toContain('Стоимость эксплуатации');
    expect(html).toContain('Lean');
    expect(html).toContain('Comfortable');
    expect(html).toContain('Intensive');
    expect(html).toContain('SELF-FUNDING');
    expect(html).toContain('Infrastructure cost');
    expect(html).toContain('FORECAST VS ACTUAL');
    expect(html).toContain('Dev Cost Ledger');
    expect(html).toContain('UNKNOWN');
    expect(html).toContain('Vercel');
    // A missing billing integration must render as unknown, never as €0 actual.
    expect(html).toContain('not-configured');
    expect(html).not.toContain('€0.00</strong>');
  });
});
