import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import type { KnowledgeGraph } from '@/lib/knowledge-map/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = getServerSupabaseClient({ useServiceRole: true });

    const { data, error } = await supabase.storage
      .from('knowledge-map')
      .download('active/graph.json');

    if (error || !data) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Граф ещё не построен. Запустите его из административного API.',
        },
        { status: 404 },
      );
    }

    const graph = JSON.parse(await data.text()) as KnowledgeGraph;

    return NextResponse.json(graph, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Не удалось загрузить граф.' },
      { status: 500 },
    );
  }
}