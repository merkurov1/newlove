import { NextResponse } from 'next/server';

// Return a simple array of published projects: { id, slug, title }
export async function GET() {
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    if (!supabase) return NextResponse.json([], { status: 200 });

    const { data: projects, error } = await supabase
      .from('projects')
      .select('id,slug,title,published')
      .eq('published', true)
      .order('publishedAt', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[api/projects] supabase error', error);
      return NextResponse.json([], { status: 200 });
    }

    const out = Array.isArray(projects) ? projects.map(p => ({ id: p.id, slug: p.slug, title: p.title })) : [];
    return NextResponse.json(out, {
      status: 200,
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (e) {
    console.error('[api/projects] Failed to fetch projects', e);
    return NextResponse.json([], { status: 200 });
  }
}

export const revalidate = 300;
