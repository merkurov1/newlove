import { createClient } from '../../../../lib/supabase/server';
import sharp from 'sharp';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    if (!slug) return new Response('Missing slug', { status: 400 });

    const supabase = createClient({ useServiceRole: true });
    const { data } = await supabase.from('liveheart_shares').select('*').eq('slug', slug).single();

    if (!data) return new Response('Not found', { status: 404 });

    const title = (data.title ?? data.dna?.name ?? 'LiveHeart').toString();
    const palette: string[] = (data.dna?.palette && Array.isArray(data.dna.palette)) ? data.dna.palette : ['260,100%,70%','320,100%,60%','200,50%,60%'];

    // Simple SVG card
    const svg = `
      <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="hsl(${palette[0]})" />
            <stop offset="50%" stop-color="hsl(${palette[1] || palette[0]})" />
            <stop offset="100%" stop-color="hsl(${palette[2] || palette[1] || palette[0]})" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="#000" />
        <rect x="40" y="40" width="1120" height="550" rx="24" fill="url(#g)" opacity="0.12" />
        <g transform="translate(100,120)">
          <text x="0" y="0" font-family="Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue'" font-size="40" fill="white" opacity="0.95">${escapeXml(title)}</text>
        </g>
        <g transform="translate(100,260)">
          <text x="0" y="0" font-family="Inter, system-ui, -apple-system, 'Segoe UI', Roboto" font-size="20" fill="white" opacity="0.8">Generated with LiveHeart</text>
        </g>
        <!-- Decorative hearts -->
        <g opacity="0.9">
          <circle cx="980" cy="150" r="80" fill="hsl(${palette[0]})" opacity="0.9" />
          <circle cx="1040" cy="230" r="60" fill="hsl(${palette[1] || palette[0]})" opacity="0.85" />
          <circle cx="900" cy="240" r="50" fill="hsl(${palette[2] || palette[1] || palette[0]})" opacity="0.8" />
        </g>
      </svg>
    `;

    const png = await sharp(Buffer.from(svg)).png().toBuffer();

    return new Response(png, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (err) {
    console.error(err);
    return new Response('Server error', { status: 500 });
  }
}

function escapeXml(str: string) {
  return str.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' } as any)[c]);
}
