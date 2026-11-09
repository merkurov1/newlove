const ICONS: Record<string, string> = {
  '16': '/pierrot/icons/favicon-16.png',
  '32': '/pierrot/icons/favicon-32.png',
  '180': '/pierrot/icons/apple-touch-icon.png',
  '192': '/pierrot/icons/icon-192.png',
  '512': '/pierrot/icons/icon-512.png',
};

/**
 * Backwards-compatible icon URL.
 *
 * Older installed manifestations may still request /admin/pierrot-icon/<size>.
 * Serve the real Pierrot avatar instead of the retired monogram by redirecting
 * to the static PNG generated from public/pierrot/pierrot-avatar-512.jpg.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ size: string }> | { size: string } }
) {
  const params = await context.params;
  const target = ICONS[params.size];

  if (!target) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(null, {
    status: 307,
    headers: {
      Location: new URL(target, request.url).toString(),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
