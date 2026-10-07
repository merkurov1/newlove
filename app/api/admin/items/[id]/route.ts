import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(
  req: NextRequest,
  { params }: RouteContext
) {
  try {
    await requireAdminFromRequest(req);

    const supabase = createClient({
      useServiceRole: true,
    });

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
            : 'Unauthorized',
      },
      { status: 401 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
) {
  try {
    await requireAdminFromRequest(req);

    const body = await req.json();

    const supabase = createClient({
      useServiceRole: true,
    });

    const { data: currentItem, error: currentError } =
      await supabase
        .from('items')
        .select('*')
        .eq('id', params.id)
        .single();

    if (currentError || !currentItem) {
      throw currentError ?? new Error('Item not found');
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    /*
     * Only update fields that were actually supplied.
     * This makes PATCH safe for autosave.
     */

    if (typeof body.title === 'string') {
      update.title = body.title;
    }

    if (typeof body.body_md === 'string') {
      update.body_md = body.body_md;
    }

    if (typeof body.lang === 'string') {
      update.lang = body.lang;
    }

    if (typeof body.slug === 'string') {
      update.slug = body.slug;
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
    }

    /*
     * Publishing:
     *
     * - preserve the original publication date if the
     *   item was already published
     * - otherwise create it now
     */
    if (body.status === 'published') {
      update.published_at =
        currentItem.published_at ??
        new Date().toISOString();

      /*
       * A published post must be public.
       */
      if (body.visibility === undefined) {
        update.visibility = 'public';
      }
    }

    /*
     * If explicitly moved back to draft, remove
     * published_at so the next publication gets a
     * fresh publication timestamp.
     */
    if (body.status === 'draft') {
      update.published_at = null;
    }

    /*
     * Avoid duplicate public slugs.
     *
     * We only need to check when a slug is being supplied.
     */
    if (typeof update.slug === 'string') {
      const requestedSlug = update.slug as string;

      const { data: collision, error: collisionError } =
        await supabase
          .from('items')
          .select('id')
          .eq('lang', (update.lang as string) ?? currentItem.lang)
          .eq('slug', requestedSlug)
          .neq('id', params.id)
          .maybeSingle();

      if (collisionError) {
        throw collisionError;
      }

      if (collision) {
        update.slug = `${requestedSlug}-${params.id.slice(
          0,
          8
        )}`;
      }
    }

    const { data: updated, error: updateError } =
      await supabase
        .from('items')
        .update(update)
        .eq('id', params.id)
        .select('*')
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
            : 'Unauthorized',
      },
      { status: 401 }
    );
  }
}