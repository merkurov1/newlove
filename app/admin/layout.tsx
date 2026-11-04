import { metadata as rootMetadata } from '@/app/layout';
import { requireAdmin } from '@/lib/serverAuth';
import { redirect } from 'next/navigation';
import AdminChrome from './AdminChrome';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

const rootTitleDefault =
  typeof rootMetadata?.title === 'object' &&
  rootMetadata?.title &&
  'default' in rootMetadata.title
    ? String(rootMetadata.title.default || 'Anton Merkurov')
    : typeof rootMetadata?.title === 'string'
      ? rootMetadata.title
      : 'Site';

export const metadata = sanitizeMetadata({
  robots: { index: false, follow: false },
  title: {
    default: `Admin — ${rootTitleDefault}`,
    template: '%s | Admin',
  },
});

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch {
    redirect('/403');
  }

  return <AdminChrome>{children}</AdminChrome>;
}
