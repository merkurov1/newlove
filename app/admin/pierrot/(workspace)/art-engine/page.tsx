import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/serverAuth';
import ArtEngineWorkspaceTab from '@/components/pierrot/workspace/ArtEngineWorkspaceTab';

import './art-engine.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ART',
  robots: { index: false, follow: false },
};

export default async function ArtEnginePage() {
  await requireAdmin();

  return (
    <div className="pw-art-engine-page">
      <ArtEngineWorkspaceTab />
    </div>
  );
}
