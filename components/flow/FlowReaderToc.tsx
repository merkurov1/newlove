'use client';

import type { KeyboardEvent } from 'react';

import type { TocItem } from '@/lib/reader/headings';

type Props = {
  headings: TocItem[];
  onSelect: (id: string) => void;
};

/**
 * Contents list for the Flow reader. Buttons (not anchors) are used so the
 * reader can focus the destination heading and close the panel predictably;
 * the URL hash is still updated by the shell.
 */
export default function FlowReaderToc({ headings, onSelect }: Props) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-toc-item]')
    );

    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = currentIndex;

    if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    } else if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, items.length - 1);
    } else {
      nextIndex = currentIndex < 0 ? items.length - 1 : Math.max(currentIndex - 1, 0);
    }

    event.preventDefault();
    items[nextIndex]?.focus();
  };

  return (
    <nav className="flow-reader-toc" aria-label="Table of contents" onKeyDown={handleKeyDown}>
      {headings.length === 0 ? (
        <p className="flow-reader-toc__empty">No headings in this publication.</p>
      ) : (
        headings.map((heading) => (
          <button
            key={heading.id}
            type="button"
            data-toc-item
            className={`flow-reader-toc__item flow-reader-toc__item--level-${Math.min(
              3,
              Math.max(1, heading.level)
            )}`}
            onClick={() => onSelect(heading.id)}
          >
            {heading.title}
          </button>
        ))
      )}
    </nav>
  );
}
