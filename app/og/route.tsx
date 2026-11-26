import { SITE_NAME } from '@/lib/seo';
import { renderOgImage, type OgFont } from '@/lib/og';

const FONT_PATH = '/fonts/NotoSans-Regular.ttf';
/**
 * The shipped font is a static Noto Sans build with its Latin and Cyrillic
 * outlines/cmap intact. GSUB/GDEF were removed and GPOS now only carries pair
 * kerning, so Satori cannot trip over the original contextual lookups (some
 * versions throw on GSUB lookupType 5 / substFormat 3 while parsing them).
 */
let fontPromise: Promise<ArrayBuffer | undefined> | null = null;

function isSupportedFont(data: ArrayBuffer): boolean {
  if (data.byteLength < 4) return false;

  const signature = new DataView(data).getUint32(0, false);
  return (
    signature === 0x00010000 || // TrueType outlines
    signature === 0x4f54544f || // 'OTTO' — CFF outlines
    signature === 0x74727565 || // 'true'
    signature === 0x74746366 // 'ttcf'
  );
}

async function loadFontData(request: Request): Promise<ArrayBuffer | undefined> {
  if (!fontPromise) {
    fontPromise = fetch(new URL(FONT_PATH, request.url))
      .then(async (response) => {
        if (!response.ok) return undefined;
        const data = await response.arrayBuffer();
        return isSupportedFont(data) ? data : undefined;
      })
      .catch(() => undefined);
  }

  const data = await fontPromise;
  if (!data) {
    // Do not cache a failed lookup forever: a deploy or CDN hiccup should heal
    // on the next request. Rendering falls back to the built-in font meanwhile.
    fontPromise = null;
    return undefined;
  }

  return data;
}

async function loadCyrillicFont(request: Request): Promise<OgFont[] | undefined> {
  const data = await loadFontData(request);
  if (!data) return undefined;

  return [
    {
      name: 'Noto Sans',
      // Copy per render: the cached buffer stays available to later requests.
      data: data.slice(0),
      weight: 400,
      style: 'normal',
    },
  ] satisfies OgFont[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get('title') || 'Art, Love & Money').slice(0, 120);
  const subtitle = (searchParams.get('subtitle') || SITE_NAME).slice(0, 140);
  const fonts = await loadCyrillicFont(request);

  try {
    const image = renderOgImage(title, subtitle, fonts);
    // Consume the stream here so a font parsing failure is catchable instead of
    // surfacing halfway through the response.
    const body = await image.arrayBuffer();
    return new Response(body, { status: image.status, headers: image.headers });
  } catch (error) {
    if (!fonts) throw error;

    console.error('[og] custom font render failed; falling back to built-in font', error);
    // A broken font asset must never take the OG endpoint down.
    fontPromise = null;
    const fallback = renderOgImage(title, subtitle);
    const body = await fallback.arrayBuffer();
    return new Response(body, { status: fallback.status, headers: fallback.headers });
  }
}
