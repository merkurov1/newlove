import { buildLlmsText } from '@/lib/llms';

export const revalidate = 3600;

export async function GET() {
  const body = await buildLlmsText(true);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
