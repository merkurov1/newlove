import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createClient } from '../../../../lib/supabase/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const dna = body?.dna ?? null;
    const title = body?.title ?? null;
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

    return NextResponse.json({ slug: data?.slug ?? slug });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
