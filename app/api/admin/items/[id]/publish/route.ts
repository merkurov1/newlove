import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
) {
  try {
    const supabase = createClient({ useServiceRole: true });

    const { data: item, error } = await supabase
      .from('items')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      item,
    });
  } catch (error) {
    console.error('[admin-item-get]', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
) {
  try {
    const body = await req.json();

    const supabase = createClient({
      useServiceRole: true,
    });

    const { data: currentItem, error: currentItemError } =
      await supabase
        .from('items')
        .select('*')
        .eq('id', params.id)
        .single();

    if (currentItemError || !currentItem) {
      throw currentItemError ?? new Error('Item not found');
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.title === 'string') {
      update.title = body.title;
    }

    if (typeof body.slug === 'string') {
      update.slug = body.slug;
    }

    if (typeof body.lang === 'string') {
      update.lang = body.lang;
    }

    if (typeof body.body_md === 'string') {
      update.body_md = body.body_md;
    }

    if (
      body.visibility === 'private' ||
      body.visibility === 'public'
    ) {
      update.visibility = body.visibility;
    }

    if (
      body.status === 'draft' ||
      body.status === 'published' ||
      body.status === 'archived'
    ) {
      update.status = body.status;

      if (body.status === 'published') {
        update.published_at =
          currentItem.published_at ??
          new Date().toISOString();
      }
    }

    if (body.metadata !== undefined) {
      update.metadata = body.metadata;
    }

    if (body.ai_allowed !== undefined) {
      update.ai_allowed = body.ai_allowed;
    }

    const { data: updated, error: updateError } =
      await supabase
        .from('items')
        .update(update)
        .eq('id', params.id)
        .select()
        .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      item: updated,
    });
  } catch (error) {
    console.error('[admin-item-patch]', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      },
      { status: 500 }
    );
  }
}