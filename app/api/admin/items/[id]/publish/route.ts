import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { invalidateFlowCache } from '@/lib/flow/items-cash';
import {
  isTechnicalText,
  normalizeFlowItem,
} from '@/lib/flow/content';

export const dynamic = 'force-dynamic';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

type RouteContext = {
  params: {
    id: string;
  };
};

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  try {
    await requireAdminFromRequest(req);
    return null;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: RouteContext
) {
  const denied = await authorize(req);
  if (denied) return denied;

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
  const denied = await authorize(req);
  if (denied) return denied;

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

    const nextStatus =
      body.status === 'draft' ||
      body.status === 'published' ||
      body.status === 'archived'
        ? body.status
        : currentItem.status;

    const nextBody =
      typeof body.body_md === 'string'
        ? body.body_md
        : currentItem.body_md ?? '';

    let nextMetadata: Record<string, unknown> =
      body.metadata !== undefined
        ? body.metadata
        : currentItem.metadata &&
            typeof currentItem.metadata === 'object' &&
            !Array.isArray(currentItem.metadata)
          ? currentItem.metadata
          : {};

    const resolved = normalizeFlowItem({
      ...currentItem,
      title:
        typeof body.title === 'string' ? body.title : currentItem.title,
      body_md: nextBody,
      type:
        typeof body.type === 'string' ? body.type : currentItem.type,
      lang:
        typeof body.lang === 'string' ? body.lang : currentItem.lang,
      source_url:
        body.source_url !== undefined
          ? body.source_url
          : currentItem.source_url,
      status: nextStatus,
      metadata: nextMetadata,
    });

    const titleIsManual =
      typeof body.title === 'string' && !isTechnicalText(body.title);

    const nextTitle = titleIsManual
      ? body.title.trim()
      : typeof body.title === 'string' ||
          isTechnicalText(currentItem.title) ||
          nextStatus === 'published'
        ? resolved.title
        : currentItem.title ?? resolved.title;

    nextMetadata = {
      ...nextMetadata,
      title_source: titleIsManual ? 'manual' : resolved.titleSource,
      ...(titleIsManual
        ? { generated_title: undefined }
        : { generated_title: nextTitle }),
    };

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      title: nextTitle,
      metadata: nextMetadata,
    };

    if (typeof body.slug === 'string') {
      update.slug = body.slug;
    }

    if (typeof body.lang === 'string') {
      update.lang = body.lang;
    }

    if (typeof body.body_md === 'string') {
      update.body_md = body.body_md;
    }

    if (typeof body.type === 'string') {
      update.type = body.type;
    }

    if (body.source_url !== undefined) {
      update.source_url = body.source_url;
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
        update.visibility = body.visibility ?? 'public';
        update.published_at =
          currentItem.published_at ??
          new Date().toISOString();

        if (!currentItem.slug) {
          update.slug = slugify(nextTitle) || `flow-${Date.now().toString(36)}`;
        }
      }
    }

    if (body.ai_allowed !== undefined) {
      update.ai_allowed = body.ai_allowed;
    }

    if (typeof body.rag_allowed === 'boolean') {
      update.rag_allowed = body.rag_allowed;
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

    invalidateFlowCache();

    const wasPublished =
      currentItem.status === 'published' &&
      currentItem.visibility === 'public';
    const isNowPublished =
      updated.status === 'published' && updated.visibility === 'public';

    if (!wasPublished && isNowPublished) {
      try {
        const { crosspostFlowItem } = await import('@/lib/flow/crosspost');
        await crosspostFlowItem(updated);
        invalidateFlowCache();
      } catch (crosspostError) {
        console.error('[admin-item-publish] crosspost error:', crosspostError);
      }
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