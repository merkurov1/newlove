'use client';

import Link from 'next/link';
import { PenLine } from 'lucide-react';

/**
 * The single "write" affordance of the owner PWA.
 *
 * It deliberately looks like the chat composer: white rounded field, soft
 * border and a muted pen. The link opens a fresh chat; ChatWorkspace already
 * focuses the textarea when ?new=1 is present.
 */
export default function WorkspaceWriteLink({ floating = false }: { floating?: boolean }) {
  return (
    <Link
      href="/admin/pierrot?new=1"
      prefetch={false}
      className={`pw-write-link${floating ? ' pw-write-link--floating' : ''}`}
      aria-label="Написать Пьеро"
      title="Написать Пьеро"
    >
      <PenLine size={15} strokeWidth={1.6} aria-hidden="true" />
      <span>Написать</span>
    </Link>
  );
}
