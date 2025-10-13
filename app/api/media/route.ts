import { NextResponse } from 'next/server';
// dynamic import to avoid circular/interop build issues

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const serverSupabase = getServerSupabaseClient();
    if (!serverSupabase) return NextResponse.json({ files: [], count: 0 });

    // List objects from storage bucket 'media' (adjust bucket name if different)
    const { data, error } = await serverSupabase.storage.from('media').list('', { limit: 1000 });
    if (error) {
      console.error('Supabase storage list error', error);
      return NextResponse.json({ files: [], count: 0 }, { status: 500 });
    }

    const files = (data || []).map((f: any) => ({
      name: f.name,
      id: f.id,
      size: f.size,
      updated_at: f.updated_at,
      path: f.name,
    }));

    return NextResponse.json({ files, count: files.length });
  } catch (e) {
    console.error('Error listing media', e);
    return NextResponse.json({ files: [], count: 0 }, { status: 500 });
  }
}