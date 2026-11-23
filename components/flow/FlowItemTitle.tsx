import type { ReactNode } from 'react';

/**
 * Flow items can hide the duplicated visible title (`showTitle === false`)
 * when the body already opens with it. The page still needs exactly one
 * semantic H1 for accessibility, search snippets and screen readers, so the
 * title is rendered visually hidden instead of being dropped.
 */
export function FlowItemTitle({
  showTitle,
  title,
}: {
  showTitle: boolean;
  title: string;
}): ReactNode {
  if (!title.trim()) return null;

  if (showTitle) {
    return (
      <h1 className="font-serif text-3xl font-light leading-[1.25] text-stone-900 sm:text-4xl lg:text-5xl">
        {title}
      </h1>
    );
  }

  return <h1 className="sr-only">{title}</h1>;
}
