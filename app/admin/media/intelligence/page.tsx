import { requireAdmin } from '@/lib/serverAuth';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

import MediaIntelligenceDashboard from '@/components/admin/MediaIntelligenceDashboard';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  robots: { index: false, follow: false },
  title: 'Media Intelligence',
});

export default async function MediaIntelligencePage() {
  await requireAdmin();

  return <MediaIntelligenceDashboard />;
}
