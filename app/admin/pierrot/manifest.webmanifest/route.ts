import { buildPierrotManifest } from '@/lib/pwa/pierrotManifest';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(buildPierrotManifest(), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
