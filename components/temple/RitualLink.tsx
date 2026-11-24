'use client';

import Link from 'next/link';
import type { ComponentProps, MouseEvent } from 'react';

type Props = ComponentProps<typeof Link>;

export default function RitualLink({ onClick, ...props }: Props) {
  const rememberOrigin = (event: MouseEvent<HTMLAnchorElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX || rect.left + rect.width / 2;
    const y = event.clientY || rect.top + rect.height / 2;

    document.documentElement.style.setProperty('--ritual-origin-x', `${x}px`);
    document.documentElement.style.setProperty('--ritual-origin-y', `${y}px`);
    onClick?.(event);
  };

  return <Link {...props} onClick={rememberOrigin} />;
}
