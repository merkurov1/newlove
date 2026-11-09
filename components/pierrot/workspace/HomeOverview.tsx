'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { BrainStatusSnapshot } from '@/lib/pierrot/memory/brainStatusTypes';
import type { WorkspaceOverview } from '@/lib/pierrot/workspace/types';

const ANIMATION_KEY_PREFIX = 'pierrot:home-statement-animated:';

/**
 * The empty chat is a single editorial statement, not a dashboard.
 *
 * The overview props remain accepted for compatibility with the workspace
 * shell, but the new-session screen deliberately renders no metrics or status
 * copy. Technical state belongs in the side panel and DASH.
 */
export default function HomeOverview({
  sessionId,
  overview: _overview,
  brainStatus: _brainStatus,
}: {
  sessionId?: string | null;
  overview?: WorkspaceOverview;
  brainStatus?: BrainStatusSnapshot | null;
}) {
  const [ready, setReady] = useState(false);
  const [animate, setAnimate] = useState(true);
  const processedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${ANIMATION_KEY_PREFIX}${sessionId || 'new'}`;
    // React Strict Mode invokes effects twice in development. The same session
    // must not lose its entrance animation because of that second invocation.
    if (processedSessionRef.current === key) return;
    processedSessionRef.current = key;

    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let alreadyAnimated = false;
    try {
      alreadyAnimated = window.sessionStorage.getItem(key) === '1';
      if (!alreadyAnimated) window.sessionStorage.setItem(key, '1');
    } catch {
      // Storage can be unavailable in private modes. Animate once per session.
    }

    setAnimate(!reduced && !alreadyAnimated);
    setReady(true);
  }, [sessionId]);

  if (!ready) return null;

  return (
    <div className="pw-empty pw-home-editorial">
      <motion.p
        className="pw-home-statement"
        initial={animate ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 1.4,
          delay: animate ? 0.08 : 0,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        Structure is the antidote to chaos.
      </motion.p>
    </div>
  );
}
