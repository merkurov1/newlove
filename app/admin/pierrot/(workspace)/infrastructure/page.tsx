import type { Metadata } from 'next';
import { requireAdmin, getServerSupabaseClient } from '@/lib/serverAuth';
import { loadCommercialSummary } from '@/lib/pierrot/commercialIntelligence';
import { emptyCommercialSummary } from '@/lib/pierrot/commercialSummary';
import { loadActualStatuses, loadDevLedgerSafe } from '@/lib/infrastructure/actuals';
import { buildCostReport } from '@/lib/infrastructure/calculator';
import { scenarioFromSearchParams } from '@/lib/infrastructure/scenarios';
import { buildDevLedgerBridge } from '@/lib/infrastructure/selfFunding';
import InfrastructureCostDashboard from '@/components/pierrot/workspace/InfrastructureCostDashboard';

import './infrastructure.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'INFRASTRUCTURE',
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function InfrastructurePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const user = await requireAdmin();
  const scenario = scenarioFromSearchParams(searchParams || {});
  const report = buildCostReport({ scenario });

  const [actuals, ledger] = await Promise.all([loadActualStatuses(), loadDevLedgerSafe(user.id)]);

  let commercial = emptyCommercialSummary('last_30_days', new Date(), [
    'commercial_summary_unavailable',
  ]);
  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    commercial = await loadCommercialSummary({
      store,
      periodKey: 'last_30_days',
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'commercial_summary_failed';
    console.error('[Infrastructure] commercial summary unavailable', { code });
  }

  const devBridge = buildDevLedgerBridge(ledger);

  return (
    <InfrastructureCostDashboard
      initialReport={report}
      actuals={actuals}
      commercial={commercial}
      devBridge={devBridge}
    />
  );
}
