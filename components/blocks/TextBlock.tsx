import React from 'react';

export default function TextBlock({ block }: { block: { type: 'richText'; data: { html: string } } }) {
  return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: block.data.html || '' }} />;
}
