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
  type?: string;
  source_url?: string | null;
  metadata?: Record<string, unknown>;
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

function deriveTitle(
  body: string,
  fallback: string,
) {
  const first =
    body
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^#{1,6}\s+/, '')
          .trim(),
      )
      .find(Boolean);

  return (
    first?.slice(0, 160) ||
    fallback.trim().slice(0, 160) ||
    'Untitled'
  );
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

    const { id } =
      await context.params;

    const supabase =
      getSupabaseAdmin();

    const {
      data,
      error,
    } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          error:
            'Failed to load item.',
          details:
            error.message,
        },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            'Item not found.',
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
          'Cache-Control':
            'no-store',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          errorMessage(error),
      },
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
  } catch (error) {
    return NextResponse.json(
      {
        error:
          errorMessage(error),
      },
      { status: 401 },
    );
  }

  const { id } =
    await context.params;

  let payload: UpdatePayload;

  try {
    payload =
      (await req.json()) as UpdatePayload;
  } catch {
    return NextResponse.json(
      {
        error:
          'Invalid JSON body.',
      },
      { status: 400 },
    );
  }

  try {
    const supabase =
      getSupabaseAdmin();

    const {
      data: existing,
      error: existingError,
    } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error:
            'Failed to load item.',
          details:
            existingError.message,
        },
        { status: 500 },
      );
    }

    if (!existing) {
      return NextResponse.json(
        {
          error:
            'Item not found.',
        },
        { status: 404 },
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

    if (
      !allowedStatuses.includes(
        nextStatus,
      )
    ) {
      return NextResponse.json(
        {
          error:
            `Invalid status: ${nextStatus}`,
        },
        { status: 400 },
      );
    }

    const nextLang =
      typeof payload.lang ===
        'string' &&
      payload.lang.trim()
        ? payload.lang.trim()
        : existing.lang;

    const nextType =
      typeof payload.type ===
        'string'
        ? payload.type
        : existing.type;

    const nextBody =
      payload.body_md !==
      undefined
        ? payload.body_md
        : existing.body_md ?? '';

    let nextTitle =
      payload.title !==
      undefined
        ? payload.title.trim()
        : existing.title ?? '';

    if (
      nextStatus ===
        'published' &&
      !nextTitle
    ) {
      const metadata =
        payload.metadata ??
        existing.metadata ??
        {};

      nextTitle =
        String(
          metadata.title ??
            metadata.alt ??
            payload.source_url ??
            existing.source_url ??
            '',
        ).trim();

      if (!nextTitle) {
        nextTitle =
          deriveTitle(
            nextBody,
            '',
          );
      }
    }

    let nextSlug =
      payload.slug !==
      undefined
        ? slugify(payload.slug)
        : existing.slug ?? '';

    if (
      nextStatus ===
      'published'
    ) {
      if (!nextTitle) {
        return NextResponse.json(
          {
            error:
              'Could not derive a title for this item.',
          },
          { status: 400 },
        );
      }

      if (!nextSlug) {
        nextSlug =
          slugify(
            nextTitle,
          );
      }

      if (!nextSlug) {
        return NextResponse.json(
          {
            error:
              'Could not generate a valid slug.',
          },
          { status: 400 },
        );
      }

      const {
        data: collision,
        error:
          collisionError,
      } = await supabase
        .from('items')
        .select('id')
        .eq(
          'lang',
          nextLang,
        )
        .eq(
          'slug',
          nextSlug,
        )
        .neq(
          'id',
          id,
        )
        .limit(1)
        .maybeSingle();

      if (collisionError) {
        return NextResponse.json(
          {
            error:
              'Failed to check slug availability.',
            details:
              collisionError.message,
          },
          { status: 500 },
        );
      }

      if (collision) {
        nextSlug =
          `${nextSlug}-${id.slice(0, 8)}`;
      }
    }

    const update: Record<
      string,
      unknown
    > = {
      status:
        nextStatus,
    };

    if (
      payload.title !==
        undefined ||
      nextStatus ===
        'published'
    ) {
      update.title =
        nextTitle;
    }

    if (
      payload.body_md !==
      undefined
    ) {
      update.body_md =
        nextBody;
    }

    if (
      payload.lang !==
      undefined
    ) {
      update.lang =
        nextLang;
    }

    if (
      payload.type !==
      undefined
    ) {
      update.type =
        nextType;
    }

    if (
      payload.source_url !==
      undefined
    ) {
      update.source_url =
        payload.source_url;
    }

    if (
      payload.metadata !==
      undefined
    ) {
      update.metadata =
        payload.metadata;
    }

    if (
      payload.slug !==
        undefined ||
      nextStatus ===
        'published'
    ) {
      update.slug =
        nextSlug;
    }

    if (
      nextStatus ===
      'published'
    ) {
      update.visibility =
        payload.visibility ??
        'public';

      update.published_at =
        existing.published_at ??
        new Date().toISOString();
    }

    if (
      nextStatus ===
      'draft'
    ) {
      update.published_at =
        null;

      update.visibility =
        payload.visibility ??
        'private';
    }

    if (
      nextStatus ===
      'archived'
    ) {
      update.visibility =
        payload.visibility ??
        'private';
    }

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
        error,
      );

      return NextResponse.json(
        {
          error:
            error.message ||
            'Failed to update item.',
          details:
            error.details ??
            null,
          hint:
            error.hint ??
            null,
          code:
            error.code ??
            null,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        item: data,
      },
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store',
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
        error:
          errorMessage(error),
      },
      { status: 500 },
    );
  }
}