import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getAuctionHouseName(url: string, rawHouse?: string): string {
  const lowercaseUrl = (url || '').toLowerCase();
  if (lowercaseUrl.includes('sothebys.com')) return "Sotheby's";
  if (lowercaseUrl.includes('christies.com')) return "Christie's";
  if (lowercaseUrl.includes('phillips.com')) return "Phillips";
  if (lowercaseUrl.includes('bonhams.com')) return "Bonhams";
  return rawHouse || "Auction House";
}

export async function POST(req: Request) {
  try {
    const { artist, title, link, image_url, ai_content, specs } = await req.json();

    let storedImagePath = image_url;

    // Download & Upload image to Supabase Storage if present
    if (image_url && image_url.startsWith('http')) {
      try {
        const imgRes = await fetch(image_url);
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const ext = image_url.split('.').pop()?.split('?')[0] || 'jpg';
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('artifacts')
            .upload(fileName, buffer, {
              contentType: imgRes.headers.get('content-type') || 'image/jpeg',
              upsert: true,
            });

          if (!uploadError && uploadData) {
            storedImagePath = uploadData.path;
          }
        }
      } catch (e) {
        console.error('Failed to upload image to bucket, falling back to original URL:', e);
      }
    }

    const resolvedAuctionHouse = getAuctionHouseName(link, specs?.auction_house);

    // Save lot to database
    const { data: lot, error } = await supabase
      .from('lots')
      .insert({
        artist: artist || ai_content?.artist || 'Unknown Artist',
        title: title || ai_content?.title || 'Untitled',
        year: ai_content?.year || specs?.year || null,
        medium: ai_content?.medium || specs?.medium || null,
        dimensions: ai_content?.dimensions || specs?.dimensions || null,
        estimate: ai_content?.estimate_raw || specs?.estimate || null,
        source_url: link,
        auction_house: resolvedAuctionHouse,
        image_path: storedImagePath,
        ai_content: ai_content,
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      lot_id: lot.id,
      redirect_url: `/art-engine/lots/${lot.id}`,
    });
  } catch (error: any) {
    console.error('Error saving lot:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
