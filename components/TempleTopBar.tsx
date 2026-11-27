'use client';

import Link from 'next/link';
import SoundToggle from '@/components/SoundToggle';
import type { ReactNode } from 'react';

export default function TempleTopBar({
  backTo = 'world',
  right,
  tone = 'ritual',
}: {
  backTo?: 'world' | 'temple';
  right?: ReactNode;
  /**
   * `ritual` is the dark amber chrome used by the older ritual routes.
   * `sanctuary` reads the shared Temple token scope instead, so a light page
   * such as /cast can reuse this bar without a second header component.
   */
  tone?: 'ritual' | 'sanctuary';
}) {
  const href =
    backTo === 'world'
      ? '/heartandangel/world'
      : '/temple';

  const label =
    backTo === 'world'
      ? 'Back to World'
      : 'Back to Temple';

  return (
    <div
      className={`temple-topbar${
        tone === 'sanctuary' ? ' temple-topbar--sanctuary' : ''
      }`}
    >
      <Link
        href={href}
        className="temple-topbar__back"
        aria-label={label}
      >
        <span aria-hidden="true">
          ←
        </span>

        <span>
          {label}
        </span>
      </Link>

      <div className="temple-topbar__actions">
        <SoundToggle
          className={
            tone === 'sanctuary'
              ? 'px-3 py-2 border border-[color:var(--line-strong)] bg-[var(--control)] text-[color:var(--ink)]'
              : 'px-3 py-2 border border-amber-300/20 bg-black/40 text-amber-100 hover:border-amber-300/50'
          }
          iconClassName={
            tone === 'sanctuary'
              ? 'text-[color:var(--gold)]'
              : 'text-pink-400'
          }
        />

        {right}
      </div>
    </div>
  );
}