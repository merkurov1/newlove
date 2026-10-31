import type { Metadata } from 'next';

import OperationsDashboard from '@/components/admin/OperationsDashboard';
import { requireAdmin } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Operations · merkurov.love',
  robots: { index: false, follow: false },
};

export default async function OperationsPage() {
  await requireAdmin();

  return <OperationsDashboard />;
}
