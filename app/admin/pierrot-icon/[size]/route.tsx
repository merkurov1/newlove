import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/**
 * Interim typographic PWA mark.
 *
 * The repository has no Pierrot mask or square logo source suitable for
 * maskable icons. This restrained monogram reuses the workspace typography
 * and palette. Replace with the real mask/logo assets when supplied.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ size: string }> | { size: string } }
) {
  const params = await context.params;
  const size = Number(params.size);

  if (![180, 192, 512].includes(size)) {
    return new Response('Not found', { status: 404 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F8F6F1',
          color: '#1D1B18',
          fontFamily: 'Georgia, Times New Roman, serif',
          fontSize: Math.round(size * 0.52),
          lineHeight: 1,
        }}
      >
        P
      </div>
    ),
    {
      width: size,
      height: size,
    }
  );
}
