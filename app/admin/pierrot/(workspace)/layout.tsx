import type { Metadata, Viewport } from 'next';
import { requireAdmin } from '@/lib/serverAuth';
import WorkspaceShell from '@/components/pierrot/workspace/WorkspaceShell';

import './workspace.css';
import './memory.css';
import './editorial.css';
import './navigation.css';
import './skills.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Pierrot',
    template: '%s · Pierrot',
  },
  applicationName: 'Pierrot',
  description: 'Owner workspace for merkurov.love.',
  robots: { index: false, follow: false },
  manifest: '/admin/pierrot/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/admin/pierrot-icon/192', sizes: '192x192', type: 'image/png' },
      { url: '/admin/pierrot-icon/512', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/admin/pierrot-icon/180', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Pierrot',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#F8F6F1',
};

export default async function PierrotWorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return <WorkspaceShell>{children}</WorkspaceShell>;
}
