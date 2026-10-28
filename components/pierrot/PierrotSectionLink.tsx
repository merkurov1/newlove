'use client';

import React from 'react';
import Link from 'next/link';
import { usePierrot } from '@/components/pierrot/PierrotContext';
import type { PierrotSectionId } from '@/lib/pierrot/navigation';

type PierrotSectionLinkProps = React.ComponentPropsWithoutRef<typeof Link> & {
  sectionId: PierrotSectionId;
};

/**
 * A normal link that becomes an explanation when JavaScript is available.
 *
 * Modifier clicks and new-tab links keep their default browser behaviour, so
 * the conversational layer never traps visitors who just want to navigate.
 */
export default function PierrotSectionLink({
  sectionId,
  href,
  onClick,
  target,
  ...props
}: PierrotSectionLinkProps) {
  const { exploreSection } = usePierrot();

  return (
    <Link
      href={href}
      target={target}
      onClick={(event) => {
        onClick?.(event);

        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (event.button !== 0 || target === '_blank') return;

        event.preventDefault();
        exploreSection(sectionId);
      }}
      {...props}
    />
  );
}
