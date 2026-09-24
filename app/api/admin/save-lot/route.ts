import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function detectAuctionHouse(url: string): string {
  if (!url) return 'Auction House';
  const lUrl = url.toLowerCase();
  if (lUrl.includes('sothebys.com')) return "Sotheby's";
  if (lUrl.includes('christies.com')) return "Christie's";
  if (lUrl.includes('phillips.com')) return "Phillips";
  if (lUrl.includes('bonhams.com')) return "Bonhams";
  return 'Auction House';
}

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const body = await req.json();
    const { artist, title, link, image_url, ai_content, specs } = body;

    const lotAI = ai_content?.lot || ai_content || {};
    let storedImagePath = null;

    if (image_url) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const imageRes = await fetch(image_url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (imageRes.ok) {
          const arrayBuffer = await imageRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const fileExt = image_url.split('.').pop()?.split('?')[0] || 'jpg';
          const safeName = `${artist || lotAI.artist || 'unknown'}-${title || lotAI.title || 'untitled'}`
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase();
          const fileName = `${safeName}_${Date.now()}.${fileExt}`;
          const contentType = imageRes.headers.get('content-type') || 'image/jpeg';

          const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('artifacts')
            .upload(fileName, buffer, { contentType, upsert: true });

          if (!uploadError && uploadData?.path) {
            storedImagePath = uploadData.path;
          }
        }
      } catch (e: any) {
        console.warn('[Saver] Image upload skipped:', e?.message || e);
      }
    }

    const computedAuctionHouse = detectAuctionHouse(link) || lotAI.auction_house;

    const record = {
      artist: artist || lotAI.artist || 'Unknown Artist',
      title: title || lotAI.title || 'Untitled',
      source_url: link,
      image_path: storedImagePath || image_url || '',
      auction_house: computedAuctionHouse,
      
      medium: lotAI.medium || specs?.medium || null,
      dimensions: lotAI.dimensions || specs?.dimensions || null,
      estimate: lotAI.estimate_raw || specs?.estimate || null,
      estimate_low: lotAI.estimate_low ?? null,
      estimate_high: lotAI.estimate_high ?? null,
      currency: lotAI.currency || 'USD',
      
      year: lotAI.year || specs?.date || null,
      provenance: typeof lotAI.provenance === 'string' 
        ? lotAI.provenance 
        : JSON.stringify(lotAI.provenance || specs?.provenance || []),
      
      ai_content: {
        ...lotAI,
        auction_house: computedAuctionHouse,
      },
      status: 'published'
    };

    const { data, error } = await supabase
      .from('lots')
      .upsert(record, { onConflict: 'source_url' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, id: data.id, lot: data });

  } catch (error: any) {
    console.error('[Saver Error]:', error);
    return NextResponse.json(
      { error: 'Save failed', details: error?.message || String(error) }, 
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
