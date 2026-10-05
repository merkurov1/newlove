import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';

// Delete media files from the protected Supabase media bucket.
export async function DELETE(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const files = body?.fileNames || (body?.fileName ? [body.fileName] : []);

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const safeFiles = files
      .filter((file: unknown): file is string => typeof file === 'string')
      .map((file: string) => file.replace(/^\/+/, '').replace(/\.\./g, ''))
      .filter(Boolean);
    if (!safeFiles.length) return NextResponse.json({ error: 'No valid files provided' }, { status: 400 });

    const { data, error } = await getServerSupabaseClient({ useServiceRole: true })
      .storage.from('media').remove(safeFiles);
    if (error) throw error;
    return NextResponse.json({ success: true, deleted: data?.length || 0, files: safeFiles });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 });
  }
}

export const dynamic = 'force-dynamic';
