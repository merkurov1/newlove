
import React from 'react';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

export default function TextBlock({ block }: { block: { type: 'richText'; data: { html: string } } }) {
  const safeHtml = sanitizeHtml(block.data.html || '');
  return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
