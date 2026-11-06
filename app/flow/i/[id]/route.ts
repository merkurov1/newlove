import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { FLOW_SITE_URL } from '@/lib/flow/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

function notFound(): NextResponse {
  return new NextResponse('Not found', {
    status: 404,
    headers: { 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

/**
 * Stable short Flow link used by Bluesky when a percent-encoded Cyrillic slug
 * would consume too much of the 300-grapheme post budget. It resolves only
 * published public items and permanently redirects to the canonical page.
 */
export async function GET(_request: Request, context: RouteContext) {
  const params = await Promise.resolve(context.params);
  const id = typeof params?.id === 'string' ? params.id : '';

  if (!UUID_PATTERN.test(id)) return notFound();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return new NextResponse('Flow is unavailable', {
      status: 503,
      headers: { 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }

  const store = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await store
    .from('items')
    .select('slug')
    .eq('id', id)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .maybeSingle();

  if (error || !data || typeof data.slug !== 'string' || !data.slug.trim()) {
    return notFound();
  }

  const destination = `${FLOW_SITE_URL}/flow/${encodeURIComponent(data.slug.trim())}`;

  return NextResponse.redirect(destination, {
    status: 308,
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}
