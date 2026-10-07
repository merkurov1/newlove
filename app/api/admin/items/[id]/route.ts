import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminFromRequest } from '@/lib/serverAuth';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdatePayload = {
  title?: string;
  body_md?: string;
  lang?: string;
  slug?: string;
  visibility?: string;
  status?: string;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase server environment variables are missing.');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

export async function GET(
  req: NextRequest,
  context: RouteContext,
) {
  try {
    await requireAdminFromRequest(req);

    const { id } = await context.params;

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[admin/items/:id] GET error:', error);

      return NextResponse.json(
        { error: 'Failed to load item.' },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Item not found.' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { item: data },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('[admin/items/:id] GET auth/error:', error);

    return NextResponse.json(
      { error: 'Unauthorized.' },
      { status: 401 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext,
) {
  try {
    await requireAdminFromRequest(req);

    const { id } = await context.params;

    const payload = (await req.json()) as UpdatePayload;

    const supabase = getSupabaseAdmin();

    const { data: existing, error: existingError } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      console.error(
        '[admin/items/:id] existing item error:',
        existingError,
      );

      return NextResponse.json(
        { error: 'Failed to load item.' },
        { status: 500 },
      );
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Item not found.' },
        { status: 404 },
      );
    }

    const nextStatus =
      payload.status !== undefined
        ? payload.status
        : existing.status;

    if (
      nextStatus !== 'draft' &&
      nextStatus !== 'published' &&
      nextStatus !== 'archived'
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid status. Allowed values: draft, published, archived.',
        },
        { status: 400 },
      );
    }

    const nextLang = payload.lang?.trim() || existing.lang;

    if (!nextLang) {
      return NextResponse.json(
        { error: 'Language is required.' },
        { status: 400 },
      );
    }

    let nextSlug =
      payload.slug !== undefined
        ? slugify(payload.slug)
        : existing.slug;

    const nextTitle =
      payload.title !== undefined
        ? payload.title.trim()
        : existing.title;

    if (nextStatus === 'published') {
      if (!nextTitle) {
        return NextResponse.json(
          { error: 'Title is required before publishing.' },
          { status: 400 },
        );
      }

      if (!nextSlug) {
        nextSlug = slugify(nextTitle);
      }

      if (!nextSlug) {
        return NextResponse.json(
          { error: 'Could not generate a valid slug.' },
          { status: 400 },
        );
      }

      const { data: collision } = await supabase
        .from('items')
        .select('id')
        .eq('lang', nextLang)
        .eq('slug', nextSlug)
        .neq('id', id)
        .limit(1)
        .maybeSingle();

      if (collision) {
        nextSlug = `${nextSlug}-${id.slice(0, 8)}`;
      }
    }

    const update: Record<string, unknown> = {};

    if (payload.title !== undefined) {
      update.title = payload.title.trim();
    }

    if (payload.body_md !== undefined) {
      update.body_md = payload.body_md;
    }

    if (payload.lang !== undefined) {
      update.lang = nextLang;
    }

    if (payload.slug !== undefined || nextStatus === 'published') {
      update.slug = nextSlug;
    }

    if (payload.visibility !== undefined) {
      update.visibility = payload.visibility;
    }

    update.status = nextStatus;

    if (nextStatus === 'published') {
      update.visibility = payload.visibility ?? 'public';
      update.published_at = existing.published_at ?? new Date().toISOString();
    }

    if (nextStatus === 'draft') {
      update.published_at = null;

      if (payload.visibility === undefined) {
        update.visibility = 'private';
      }
    }

    if (nextStatus === 'archived') {
      if (payload.visibility === undefined) {
        update.visibility = 'private';
      }
    }

    const { data, error } = await supabase
      .from('items')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[admin/items/:id] PATCH error:', error);

      return NextResponse.json(
        { error: 'Failed to update item.' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { item: data },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('[admin/items/:id] PATCH auth/error:', error);

    return NextResponse.json(
      { error: 'Unauthorized.' },
      { status: 401 },
    );
  }
}