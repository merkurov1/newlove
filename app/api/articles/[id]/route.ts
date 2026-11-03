export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import {
  getServerSupabaseClient,
  requireAdminFromRequest,
} from '@/lib/serverAuth';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const articleId = params.id;

  if (!articleId || articleId.length > 200) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  let isAdmin = false;

  try {
    await requireAdminFromRequest(request);
    isAdmin = true;
  } catch {
    isAdmin = false;
  }

  try {
    const supabase = isAdmin
      ? getServerSupabaseClient({ useServiceRole: true })
      : (await getUserAndSupabaseForRequest(request)).supabase;

    if (!supabase) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    let query = supabase.from('articles').select('*').eq('id', articleId);

    if (!isAdmin) query = query.eq('published', true);

    const { data: article, error } = await query.maybeSingle();

    if (error || !article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    return NextResponse.json(article);
  } catch {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }
}
