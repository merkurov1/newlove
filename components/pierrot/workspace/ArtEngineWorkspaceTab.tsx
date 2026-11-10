'use client';

import ArtEngineWorkspace from '@/components/art-engine/ArtEngineWorkspace';
import { artEngineAuthFetch } from '@/components/art-engine/authFetch';

export default function ArtEngineWorkspaceTab() {
  return <ArtEngineWorkspace authFetch={artEngineAuthFetch} embeddedInPierrot />;
}
