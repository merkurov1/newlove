import type { MetadataRoute } from 'next';

/**
 * Heart & Angel manifest, served as a route handler.
 *
 * Next.js 14 treats `app/manifest.ts` as a static metadata file and inherits
 * that link into every nested route, which overrides a child layout's own
 * `manifest` export. A route handler avoids that inheritance and lets the
 * Heart & Angel layout point at this scope-specific manifest instead.
 */
export const dynamic = 'force-static';

const manifest: MetadataRoute.Manifest = {
  id: '/heartandangel',
  name: 'Heart & Angel',
  short_name: 'Heart & Angel',
  description:
    'A living digital mythology of angels, hearts and small rituals inside the Heart & Angel Temple.',
  start_url: '/heartandangel',
  scope: '/heartandangel',
  display: 'standalone',
  orientation: 'any',
  background_color: '#FAF8F5',
  theme_color: '#FAF8F5',
  lang: 'en',
  dir: 'ltr',
  categories: ['art', 'entertainment'],
  icons: [
    {
      src: '/heartandangel/icons/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/heartandangel/icons/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/heartandangel/icons/maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: '/heartandangel/icons/apple-touch-icon.png',
      sizes: '180x180',
      type: 'image/png',
      purpose: 'any',
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
