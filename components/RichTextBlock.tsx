import React from 'react';

type Props = { html: string };
export default function RichTextBlock({ html }: Props) {
  return (
    <div
      className="prose lg:prose-xl max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
