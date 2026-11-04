import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/serverAuth';
import { loadIntegrationSnapshot, loadRecentFlowItems } from '@/lib/pierrot/workspace/data';
import FlowWorkspace from '@/components/pierrot/workspace/FlowWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FLOW',
};

export default async function FlowPage() {
  await requireAdmin();
  const [items, integrations] = await Promise.all([
    loadRecentFlowItems(8),
    Promise.resolve(loadIntegrationSnapshot()),
  ]);

  return (
    <FlowWorkspace
      items={items}
      channels={{
        telegram: integrations.telegramConfigured,
        bluesky: integrations.blueskyConfigured,
      }}
    />
  );
}
