import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { getServerSupabaseClient } from '@/lib/serverAuth';

// Check slug availability against the requested content table.
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug')?.trim();
    const requestedType = url.searchParams.get('type');
    const type = requestedType === 'letter' ? 'letters' : requestedType === 'project' ? 'projects' : 'articles';
    const excludeId = url.searchParams.get('excludeId');
    if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json({ exists: false, available: false, error: 'Use lowercase letters, numbers, and hyphens.' });
    }

    const supabase = getServerSupabaseClient({ useServiceRole: true });
    let query = supabase.from(type).select('id').eq('slug', slug).limit(1);
    if (excludeId) query = query.neq('id', excludeId);
    const { data, error } = await query;
    if (error) throw error;
    const exists = Boolean(data?.length);
    return NextResponse.json({ exists, available: !exists });
  } catch (error: any) {
    const message = error?.message || 'Unable to validate slug';
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 });
  }
}
