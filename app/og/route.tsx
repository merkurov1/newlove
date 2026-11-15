import { SITE_NAME } from '@/lib/seo';
import { renderOgImage, type OgFont } from '@/lib/og';


const FONT_PATH = '/fonts/NotoSans-Regular.ttf';
let fontPromise: Promise<ArrayBuffer | undefined> | null = null;

async function loadCyrillicFont(request: Request): Promise<OgFont[] | undefined> {
  if (!fontPromise) {
    fontPromise = fetch(new URL(FONT_PATH, request.url))
      .then(async (response) => {
        if (!response.ok) return undefined;
        return response.arrayBuffer();
      })
      .catch(() => undefined);
  }

  const data = await fontPromise;
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

  return renderOgImage(title, subtitle, fonts);
}
