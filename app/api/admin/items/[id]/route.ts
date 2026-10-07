import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient({ useServiceRole: true });

    const { data: item, error } = await supabase
      .from('items')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('[admin-item-get]', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const supabase = createClient({ useServiceRole: true });

    const { data: currentItem, error: currentItemError } = await supabase
      .from('items')
      .select('*')
      .eq('id', params.id)
      .single();

    if (currentItemError) throw currentItemError;

    const { data: lastVersion } = await supabase
      .from('item_versions')
      .select('version')
      .eq('item_id', params.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (lastVersion?.version ?? 0) + 1;

    const nextTitle = body.title ?? currentItem.title;
    const nextSlug = body.slug ?? currentItem.slug;
    const nextLang = body.lang ?? currentItem.lang;
    const nextBody = body.body_md ?? currentItem.body_md;
    const nextVisibility = body.visibility ?? currentItem.visibility;
    const nextStatus = body.status ?? currentItem.status;

    const { data: updated, error: updateError } = await supabase
      .from('items')
      .update({
        title: nextTitle,
        slug: nextSlug,
        lang: nextLang,
        body_md: nextBody,
        visibility: nextVisibility,
        status: nextStatus,
        updated_at: new Date().toISOString(),
        ...(nextStatus === 'published' && {
          published_at: new Date().toISOString(),
        }),
      })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    const { error: versionError } = await supabase.from('item_versions').insert({
      item_id: params.id,
      version: nextVersion,
      title: currentItem.title,
      body_md: currentItem.body_md,
      metadata: currentItem.metadata ?? {},
      created_at: new Date().toISOString(),
    });

    if (versionError) throw versionError;

    return NextResponse.json({ success: true, item: updated });
  } catch (error) {
    console.error('[admin-item-patch]', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
