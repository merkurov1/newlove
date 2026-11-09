import React from 'react';
import type { Metadata } from 'next';
import ArtEngineClient from './ArtEngineClient';
import { JsonLd } from '@/components/seo/JsonLd';
import { PageEvent } from '@/components/analytics/PageEvent';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, webPageJsonLd } from '@/lib/structuredData';

const ART_ENGINE_DESCRIPTION =
  'Institutional-grade art acquisition, liquidity analysis and curatorial dossier synthesis in the Merkurov Art Engine.';

export const metadata: Metadata = pageMetadata({
  title: 'Art Engine — Art Market Intelligence | Merkurov',
  description: ART_ENGINE_DESCRIPTION,
  path: '/art-engine',
  languages: { 'x-default': '/art-engine', en: '/art-engine' },
});

export default function ArtEnginePage() {
  return (
    <>
      <PageEvent name="art_engine_view" params={{ section: 'art_engine' }} />
      {/* Server-rendered page heading: the interactive terminal is client-only,
          so without this the initial HTML has no h1 for crawlers and assistive
          technology. The visible terminal heading is an h2. */}
      <h1 className="sr-only">Art Engine — Art Market Intelligence</h1>
      {/* The service itself is a WebPage, not a VisualArtwork. Individual
          artworks and lots carry their own VisualArtwork entities. */}
      <JsonLd
        data={webPageJsonLd({
          path: '/art-engine',
          name: 'Art Engine — Art Market Intelligence',
          description: ART_ENGINE_DESCRIPTION,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Art Engine', path: '/art-engine' },
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
