'use client';

import { useState } from 'react';
import { PIERROT_AVATAR_SRC } from '@/lib/pierrot/config';

export default function PierrotAvatar({
  size = 30,
  className = '',
  fallback = 'monogram',
}: {
  size?: number;
  className?: string;
  /** `none` keeps the space but never replaces a missing portrait with "P". */
  fallback?: 'monogram' | 'none';
}) {
  const [failed, setFailed] = useState(false);
  const showPortrait = Boolean(PIERROT_AVATAR_SRC) && !failed;

  return (
    <span
      className={`pw-avatar-badge ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
      data-pierrot-avatar
      data-avatar-state={showPortrait ? 'portrait' : 'fallback'}
    >
      {showPortrait ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={PIERROT_AVATAR_SRC}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
        />
      ) : fallback === 'monogram' ? (
        <span className="pw-avatar-fallback">P</span>
      ) : null}
    </span>
  );
}
