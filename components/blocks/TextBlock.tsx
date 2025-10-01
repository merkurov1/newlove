import React from 'react';

export default function TextBlock({ block }: { block: any }) {
  switch (block.type) {
    case 'header':
      return <h2 className="text-2xl font-semibold my-4">{block.data.text}</h2>;
    case 'paragraph':
      return <p className="my-2">{block.data.text}</p>;
    case 'list':
      return (
        <ul className="list-disc ml-6 my-2">
          {block.data.items.map((item: string, i: number) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}
