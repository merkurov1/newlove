import React from 'react';

type Props = { language: string; code: string };

export default function CodeBlock({ language, code }: Props) {
  return (
    <pre>
      <code className={`language-${language}`}>{code}</code>
    </pre>
  );
}
