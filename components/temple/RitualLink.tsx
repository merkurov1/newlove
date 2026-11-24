'use client';

import Link from 'next/link';
import type { ComponentProps, MouseEvent } from 'react';

type Props = ComponentProps<typeof Link>;

export default function RitualLink({ onClick, ...props }: Props) {
  const rememberOrigin = (event: MouseEvent<HTMLAnchorElement>) => {
    document.documentElement.style.setProperty('--ritual-origin-x', `${event.clientX}px`);
    document.documentElement.style.setProperty('--ritual-origin-y', `${event.clientY}px`);
    onClick?.(event);
  };

  return <Link {...props} onClick={rememberOrigin} />;
}
