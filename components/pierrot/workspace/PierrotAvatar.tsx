'use client';

import { useState } from 'react';
import { PIERROT_AVATAR_SRC } from '@/lib/pierrot/config';

export default function PierrotAvatar({
  size = 30,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`pw-avatar-badge ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {PIERROT_AVATAR_SRC && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={PIERROT_AVATAR_SRC}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="pw-avatar-fallback">P</span>
      )}
    </span>
  );
}
