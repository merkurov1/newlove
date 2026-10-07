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
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase server environment variables are missing.',
    );
  }

  return createClient(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return 'Unknown server error.';
}

export async function GET(
  req: NextRequest,
  context: RouteContext,
) {
  try {
    await requireAdminFromRequest(req);

    const { id } = await context.params;

    const supabase = getSupabaseAdmin();

    const {
      data,
      error,
    } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(
        '[admin/items/:id] GET database error:',
        error,
      );

      return NextResponse.json(
        {
          error: 'Failed to load item.',
          details: error.message,
        },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error: 'Item not found.',
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        item: data,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    const message = errorMessage(error);

    console.error(
      '[admin/items/:id] GET authorization error:',
      error,
    );

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 401,
      },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext,
) {
  /*
   * Authentication is intentionally outside the database
   * operation so a database error can never be reported as
   * "Unauthorized".
   */
  try {
    await requireAdminFromRequest(req);
  } catch (error) {
    const message = errorMessage(error);

    console.error(
      '[admin/items/:id] PATCH authorization failed:',
      error,
    );

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 401,
      },
    );
  }

  const { id } = await context.params;

  let payload: UpdatePayload;

  try {
    payload = (await req.json()) as UpdatePayload;
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid JSON body.',
      },
      {
        status: 400,
      },
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    const {
      data: existing,
      error: existingError,
    } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      console.error(
        '[admin/items/:id] existing item lookup failed:',
        existingError,
      );

      return NextResponse.json(
        {
          error: 'Failed to load item.',
          details: existingError.message,
        },
        {
          status: 500,
        },
      );
    }

    if (!existing) {
      return NextResponse.json(
        {
          error: 'Item not found.',
        },
        {
          status: 404,
        },
      );
    }

    const nextStatus =
      payload.status !== undefined
        ? payload.status
        : existing.status;

    const allowedStatuses = [
      'draft',
      'published',
      'archived',
    ];

    if (!allowedStatuses.includes(nextStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status: ${nextStatus}`,
        },
        {
          status: 400,
        },
      );
    }

    const nextLang =
      typeof payload.lang === 'string' &&
      payload.lang.trim()
        ? payload.lang.trim()
        : existing.lang;

    if (!nextLang) {
      return NextResponse.json(
        {
          error: 'Language is required.',
        },
        {
          status: 400,
        },
      );
    }

    const nextTitle =
      payload.title !== undefined
        ? payload.title.trim()
        : (existing.title ?? '');

    let nextSlug =
      payload.slug !== undefined
        ? slugify(payload.slug)
        : (existing.slug ?? '');

    /*
     * Publishing always requires a real title and slug.
     */
    if (nextStatus === 'published') {
      if (!nextTitle) {
        return NextResponse.json(
          {
            error:
              'Title is required before publishing.',
          },
          {
            status: 400,
          },
        );
      }

      if (!nextSlug) {
        nextSlug = slugify(nextTitle);
      }

      if (!nextSlug) {
        return NextResponse.json(
          {
            error:
              'Could not generate a valid slug.',
          },
          {
            status: 400,
          },
        );
      }

      /*
       * Avoid collision with another item.
       */
      const {
        data: collision,
        error: collisionError,
      } = await supabase
        .from('items')
        .select('id')
        .eq('lang', nextLang)
        .eq('slug', nextSlug)
        .neq('id', id)
        .limit(1)
        .maybeSingle();

      if (collisionError) {
        console.error(
          '[admin/items/:id] slug collision lookup failed:',
          collisionError,
        );

        return NextResponse.json(
          {
            error:
              'Failed to check slug availability.',
            details: collisionError.message,
          },
          {
            status: 500,
          },
        );
      }

      if (collision) {
        nextSlug =
          `${nextSlug}-${id.slice(0, 8)}`;
      }
    }

    const update: Record<string, unknown> = {
      status: nextStatus,
    };

    if (payload.title !== undefined) {
      update.title = nextTitle;
    }

    if (payload.body_md !== undefined) {
      update.body_md = payload.body_md;
    }

    if (payload.lang !== undefined) {
      update.lang = nextLang;
    }

    if (
      payload.slug !== undefined ||
      nextStatus === 'published'
    ) {
      update.slug = nextSlug;
    }

    /*
     * Publish transition.
     */
    if (nextStatus === 'published') {
      update.visibility =
        payload.visibility ?? 'public';

      update.published_at =
        existing.published_at ??
        new Date().toISOString();
    }

    /*
     * Draft transition.
     */
    if (nextStatus === 'draft') {
      update.published_at = null;

      update.visibility =
        payload.visibility ?? 'private';
    }

    /*
     * Archive transition.
     */
    if (nextStatus === 'archived') {
      update.visibility =
        payload.visibility ?? 'private';
    }

    console.log(
      '[admin/items/:id] updating item',
      {
        id,
        status: nextStatus,
        lang: nextLang,
        slug: nextSlug,
      },
    );

    const {
      data,
      error,
    } = await supabase
      .from('items')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error(
        '[admin/items/:id] UPDATE DATABASE ERROR:',
        {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            'Failed to update item.',
          details: error.details ?? null,
          hint: error.hint ?? null,
          code: error.code ?? null,
        },
        {
          status: 500,
        },
      );
    }

    console.log(
      '[admin/items/:id] update successful',
      {
        id,
        status: data.status,
        visibility: data.visibility,
        slug: data.slug,
      },
    );

    return NextResponse.json(
      {
        success: true,
        item: data,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      '[admin/items/:id] PATCH unexpected error:',
      error,
    );

    return NextResponse.json(
      {
        error: errorMessage(error),
      },
      {
        status: 500,
      },
    );
  }
}