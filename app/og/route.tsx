import { SITE_NAME } from '@/lib/seo';
import { renderOgImage } from '@/lib/og';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get('title') || 'Art, Love & Money').slice(0, 120);
  const subtitle = (searchParams.get('subtitle') || SITE_NAME).slice(0, 140);

  return renderOgImage(title, subtitle);
}
