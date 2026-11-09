'use client';

import type { BrainStatusSnapshot } from '@/lib/pierrot/memory/brainStatusTypes';
import type { WorkspaceOverview } from '@/lib/pierrot/workspace/types';

/**
 * The empty chat is a single editorial statement, not a dashboard.
 *
 * The overview props remain accepted for compatibility with the workspace
 * shell, but the new-session screen deliberately renders no metrics or status
 * copy. Technical state belongs in the side panel and DASH.
 *
 * No entrance animation here on purpose: opening a new chat should render the
 * statement immediately, without a framer-motion mount/fade cycle.
 */
export default function HomeOverview({
  sessionId: _sessionId,
  overview: _overview,
  brainStatus: _brainStatus,
}: {
  sessionId?: string | null;
  overview?: WorkspaceOverview;
  brainStatus?: BrainStatusSnapshot | null;
}) {
  return (
    <div className="pw-empty pw-home-editorial">
      <p className="pw-home-statement">Structure is the antidote to chaos.</p>
    </div>
  );
}
