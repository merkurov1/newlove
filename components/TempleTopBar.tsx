'use client';

import Link from 'next/link';
import SoundToggle from '@/components/SoundToggle';
import type { ReactNode } from 'react';

export default function TempleTopBar({ backTo = 'temple', right }: { backTo?: 'world' | 'temple'; right?: ReactNode }) {
  const href = backTo === 'world' ? '/heartandangel/world' : '/temple';
  const label = backTo === 'world' ? 'Back to World' : 'Back to Temple';
  return (
    <div className="temple-topbar">
      <Link href={href} className="temple-topbar__back" aria-label={`Return ${label.toLowerCase()}`}>
        <span aria-hidden="true">←</span><span>{label}</span>
      </Link>
      <div className="temple-topbar__actions"><SoundToggle className="px-3 py-2 border border-amber-300/20 bg-black/40 text-amber-100 hover:border-amber-300/50" />{right}</div>
    </div>
  );
}
