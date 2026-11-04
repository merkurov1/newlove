import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/serverAuth';
import FlowWorkspace from '@/components/pierrot/workspace/FlowWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FLOW',
};

export default async function FlowPage() {
  await requireAdmin();

  return <FlowWorkspace />;
}
