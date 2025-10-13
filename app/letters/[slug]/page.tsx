import React from 'react';

type Props = { params: { slug: string } };

export default function LetterPage({ params }: Props) {
  const { slug } = params;
  return (
    <main>
      <h1>Letter: {slug}</h1>
      <p>This is a placeholder page for letters — real implementation coming.</p>
    </main>
  );
}
// Entire file deleted