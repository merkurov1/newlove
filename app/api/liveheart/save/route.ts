import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createClient } from '../../../../lib/supabase/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const dna = body?.dna ?? null;
    const title = body?.title ?? null;
    const imageData: string | undefined = body?.imageData;
    if (!dna) return NextResponse.json({ error: 'Missing dna' }, { status: 400 });

    const slug = nanoid(8);

    const supabase = createClient({ useServiceRole: true });
    const { data, error } = await supabase
      .from('liveheart_shares')
      .insert({ slug, dna, title })
      .select('slug')
      .single();

    if (error) {
      // If slug collision, try a couple times
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: error.message || 'db error' }, { status: 500 });
    }

    // If client provided a PNG data URL, upload it to Supabase Storage
    if (imageData && typeof imageData === 'string' && imageData.startsWith('data:image')) {
      try {
        const bucket = 'liveheart-og';
        const path = `og/${slug}.png`;
        const matches = imageData.match(/^data:(image\/png);base64,(.*)$/);
        if (matches) {
          const base64 = matches[2];
          const buffer = Buffer.from(base64, 'base64');
          const up = await supabase.storage.from(bucket).upload(path, buffer, {
            contentType: 'image/png',
            upsert: true,
          });
          if (up.error) console.error('Storage upload error:', up.error);
        }
      } catch (err) {
        console.error('Failed to upload OG image:', err);
      }
    }

    return NextResponse.json({ slug: data?.slug ?? slug });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
