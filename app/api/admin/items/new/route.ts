import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);

    const body = await req.json();

    const supabase = createClient({
      useServiceRole: true,
    });

    const title =
      typeof body.title === 'string'
        ? body.title.trim()
        : '';

    /*
     * Drafts need a unique temporary slug.
     * The final public slug is generated on Publish.
     */
    const draftSlug = `draft-${crypto.randomUUID()}`;

    const { data: item, error } = await supabase
      .from('items')
      .insert({
        type:
          typeof body.type === 'string'
            ? body.type
            : 'note',

        status: 'draft',

        visibility: 'private',

        lang:
          typeof body.lang === 'string'
            ? body.lang
            : 'ru',

        slug: draftSlug,

        title,

        body_md:
          typeof body.body_md === 'string'
            ? body.body_md
            : '',

        source_url:
          typeof body.source_url === 'string'
            ? body.source_url
            : null,

        metadata:
          body.metadata &&
          typeof body.metadata === 'object'
            ? body.metadata
            : {},

        ai_allowed:
          typeof body.ai_allowed === 'boolean'
            ? body.ai_allowed
            : true,
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      item,
    });
  } catch (error) {
    console.error('[admin-items-new]', error);

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