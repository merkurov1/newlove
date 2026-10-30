import React from 'react';
import type { Metadata } from 'next';
import ArtEngineClient from './ArtEngineClient';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, creativeWorkJsonLd } from '@/lib/structuredData';

const ART_ENGINE_DESCRIPTION =
  'Institutional-grade art acquisition, liquidity analysis and curatorial dossier synthesis in the Merkurov Curator Engine.';

export const metadata: Metadata = pageMetadata({
  title: 'Curator Engine — Art Market Intelligence | Merkurov',
  description: ART_ENGINE_DESCRIPTION,
  path: '/art-engine',
  languages: { 'x-default': '/art-engine', en: '/art-engine' },
});

export default function ArtEnginePage() {
  return (
    <>
      <JsonLd
        data={creativeWorkJsonLd({
          path: '/art-engine',
          name: 'Curator Engine — Art Market Intelligence',
          description: ART_ENGINE_DESCRIPTION,
          genre: 'Art market research tool',
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Curator Engine', path: '/art-engine' },
        ])}
      />
      <React.Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center font-mono text-xs uppercase tracking-widest text-gray-400">
          Initializing Terminal...
        </div>
      }
    >
      <ArtEngineClient />
      </React.Suspense>
    </>
  );
}
