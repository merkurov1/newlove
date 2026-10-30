import type { ReactNode } from 'react';

/** Renders exactly one JSON-LD entity per script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> | null | undefined }) {
  if (!data) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}

/** Convenience wrapper for multiple independent entities. */
export function JsonLdGroup({ items }: { items: Array<Record<string, unknown> | null | undefined> }) {
  return (
    <>
      {items.filter(Boolean).map((item, index) => (
        <JsonLd key={index} data={item as Record<string, unknown>} />
      ))}
    </>
  );
}

export type JsonLdChild = ReactNode;
