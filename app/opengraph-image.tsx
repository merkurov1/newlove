import { DEFAULT_OG_ALT, SITE_NAME } from '@/lib/seo';
import { OG_SIZE, renderOgImage } from '@/lib/og';

export const runtime = 'edge';
export const alt = DEFAULT_OG_ALT;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function OpengraphImage() {
  return renderOgImage('Art, Love & Money', SITE_NAME);
}
