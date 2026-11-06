import type React from 'react';
import { getCurrentUser } from '@/lib/serverAuth';
import WorkspaceShell from '@/components/pierrot/workspace/WorkspaceShell';

import '../../admin/pierrot/(workspace)/workspace.css';

export const dynamic = 'force-dynamic';

/**
 * The owner enters Heart & Angel from the Pierrot rail, but the public World
 * route must stay the canonical /heartandangel/world URL.
 *
 * For an authenticated admin we therefore reuse the same WorkspaceShell around
 * the public scene instead of creating a second, disconnected owner view.
 * Visitors keep the original public layout untouched.
 */
export default async function HeartWorldLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);

  if (user?.role === 'ADMIN') {
    return <WorkspaceShell>{children}</WorkspaceShell>;
  }

  return <>{children}</>;
}
