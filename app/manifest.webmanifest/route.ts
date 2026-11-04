import type { MetadataRoute } from 'next';

/**
 * Site-wide manifest, served as a route handler.
 *
 * This was previously `app/manifest.ts`. That file convention is inherited by
 * every nested route and its link overrides nested layouts' `manifest` export,
 * which makes scope-specific manifests (Heart & Angel, Pierrot) impossible.
 * Serving the same JSON from a route handler keeps `/manifest.webmanifest`
 * intact while letting nested layouts choose their own manifest.
 */
export const dynamic = 'force-static';

const manifest: MetadataRoute.Manifest = {
  name: 'Anton Merkurov | Art x Love x Money',
  short_name: 'Anton Merkurov',
  description:
    'Digital Strategist, Art Dealer, and Heritage Architect. The intersection of High-Tech and Old Money.',
  start_url: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#ffffff',
  icons: [
    {
      src: '/favicon.ico',
      sizes: 'any',
      type: 'image/x-icon',
    },
    {
      src: '/icon',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: '/apple-icon',
      sizes: '180x180',
      type: 'image/png',
    },
  ],
};

export function GET() {
  return Response.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
