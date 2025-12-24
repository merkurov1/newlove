import React from 'react';

export default function Head() {
  const title = 'From Content Censorship to Hardware Hegemony — Merkurov.Report';
  const description = 'Analytical report (2025) by Anton Merkurov on the transformation of digital control in Russia — from content censorship to device and infrastructure control. Insightful forecasts and practical analysis for journalists and researchers.';
  const image = '/images/og/novayagazeta2025.png';
  const path = '/research/novayagazeta2025';

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="article" />
      <meta property="og:image" content={image} />
      <meta property="og:image:alt" content="Cover image for NovayaGazeta 2025 report" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* Canonical / site */}
      <link rel="canonical" href={path} />
    </>
  );
}
