import React from 'react';

export default function CodeBlock({ block }: { block: { type: 'code'; data: { code: string } } }) {
  return (
    <pre className="bg-gray-900 text-white rounded p-4 my-4 overflow-x-auto">
      <code>{block.data.code}</code>
    </pre>
  );
}
