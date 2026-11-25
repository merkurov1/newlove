'use client';

import Link from 'next/link';
import type { ComponentProps, MouseEvent } from 'react';

import { rememberRevealSource } from '@/lib/temple/modalReveal';

type Props = ComponentProps<typeof Link>;

export default function RitualLink({ onClick, ...props }: Props) {
  const rememberOrigin = (event: MouseEvent<HTMLAnchorElement>) => {
    rememberRevealSource(
      event.currentTarget,
      typeof props.href === 'string' ? props.href : null
    );
    onClick?.(event);
  };

  return (
    <Link
      {...props}
      data-reveal-path={typeof props.href === 'string' ? props.href : undefined}
      onClick={rememberOrigin}
    />
  );
}
