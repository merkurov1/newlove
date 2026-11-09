import type { Metadata, Viewport } from 'next';
import { requireAdmin } from '@/lib/serverAuth';
import WorkspaceShell from '@/components/pierrot/workspace/WorkspaceShell';
import { loadProjectRail } from '@/lib/pierrot/workspace/projectRail';
import type { WorkspaceNavProject } from '@/lib/pierrot/workspace/navigation';

import './workspace.css';
import './memory.css';
import './editorial.css';
import './navigation.css';

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
      { url: '/pierrot/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/pierrot/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/pierrot/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pierrot/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/pierrot/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: [{ url: '/pierrot/icons/icon-192.png', type: 'image/png' }],
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
  const user = await requireAdmin();
  const projects = await loadProjectRail(user.id).catch(() => []);
  const navProjects: WorkspaceNavProject[] = projects.map((project) => ({
    id: project.id,
    slug: project.slug,
    name: project.name,
    historyId: project.historyId,
    href: project.chatHref,
  }));

  return <WorkspaceShell projects={navProjects}>{children}</WorkspaceShell>;
}
