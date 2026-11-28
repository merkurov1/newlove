import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { requireAdmin } from '@/lib/serverAuth';
import { loadInstantViewStatus } from '@/lib/telegram/instantViewAuth';

import InstantViewAuthPanel from './InstantViewAuthPanel';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  robots: { index: false, follow: false },
  title: 'Telegram Instant View',
});

export default async function TelegramInstantViewPage() {
  await requireAdmin();
  const initial = await loadInstantViewStatus();

  return <InstantViewAuthPanel initial={initial} />;
}
