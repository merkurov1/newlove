import { NextResponse } from 'next/server';

import { getCurrentUser, getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/**
 * Media bucket listing is an administrative operation.
 *
 * The previous implementation obtained a service-role client before checking
 * the caller and therefore treated an anonymous request as privileged. The
 * order is now strict: verify an administrator first, then create the service
 * client, then perform the privileged storage call.
 */
export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch {
    let authenticated = false;

    try {
      authenticated = Boolean(await getCurrentUser());
    } catch {
      authenticated = false;
    }

    return json({ error: authenticated ? 'Forbidden' : 'Unauthorized' }, authenticated ? 403 : 401);
  }

  let supabase;

  try {
    supabase = getServerSupabaseClient({ useServiceRole: true });
  } catch {
    return json({ error: 'Media storage is not configured.' }, 503);
  }

  try {
    const { data, error } = await supabase.storage.from('media').list('', { limit: 1000 });

    if (error) {
      console.error('[api/media] storage list failed');
      return json({ error: 'Media storage is temporarily unavailable.' }, 503);
    }

    const files = (data || []).map((file) => {
      const record = file as typeof file & {
        size?: number | null;
        updated_at?: string | null;
      };

      return {
        name: file.name,
        id: file.id,
        size: record.size ?? null,
        updated_at: record.updated_at ?? null,
        path: file.name,
      };
    });

    return json({ files, count: files.length });
  } catch {
    console.error('[api/media] unexpected storage error');
    return json({ error: 'Media storage is temporarily unavailable.' }, 500);
  }
}
