import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { extractPreview } from '@/lib/journal/preview';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 20;

function mapIssue(issue: any) {
  const lang = String(issue.lang || '').trim();

  return {
    id: String(issue.id),
    title: String(issue.title || 'Untitled'),
    slug: String(issue.slug || ''),
    preview: extractPreview(issue.content, issue.payload, 320),
    publishedAt: issue.publishedAt || null,
    sentAt: issue.sentAt || null,
    createdAt: issue.createdAt || null,
    kind: 'issue',
    lang: lang || null,
    number: issue.number == null ? null : Number(issue.number),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const type = url.searchParams.get('type') || 'issues';
  if (type !== 'issues') {
    return NextResponse.json(
      { error: 'Unsupported journal query.' },
      { status: 400 },
    );
  }

  const requestedLang = url.searchParams.get('lang') || 'all';
  const lang =
    requestedLang === 'ru' || requestedLang === 'en'
      ? requestedLang
      : 'all';

  const parsedOffset = Number.parseInt(
    url.searchParams.get('offset') || '0',
    10,
  );
  const offset = Number.isFinite(parsedOffset)
    ? Math.max(0, parsedOffset)
    : 0;

  const parsedLimit = Number.parseInt(
    url.searchParams.get('limit') || String(DEFAULT_PAGE_SIZE),
    10,
  );
  const pageSize = Number.isFinite(parsedLimit)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, parsedLimit))
    : DEFAULT_PAGE_SIZE;

  try {
    const supabase = createClient();

    const columnsWithPayload =
      'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,number,payload';

    const columnsWithoutPayload =
      'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,number';

    async function runQuery(columns: string) {
      let query: any = supabase
        .from('letters')
        .select(columns)
        .eq('published', true)
        .eq('kind', 'issue');

      if (lang === 'en') {
        query = query.ilike('lang', 'en%');
      } else if (lang === 'ru') {
        query = query.ilike('lang', 'ru%');
      }

      return query
        .order('publishedAt', {
          ascending: false,
          nullsFirst: false,
        })
        .order('id', { ascending: false })
        .range(offset, offset + pageSize);
    }

    let result = await runQuery(columnsWithPayload);

    if (result.error) {
      result = await runQuery(columnsWithoutPayload);
    }

    if (result.error) {
      console.error('[Journal API] Query failed:', result.error);

      return NextResponse.json(
        { error: 'Could not load editions.' },
        { status: 500 },
      );
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    const hasMore = rows.length > pageSize;
    const articles = rows.slice(0, pageSize).map(mapIssue);

    return NextResponse.json(
      {
        articles,
        hasMore,
        nextOffset: offset + articles.length,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('[Journal API] Unexpected error:', error);

    return NextResponse.json(
      { error: 'Internal error while loading editions.' },
      { status: 500 },
    );
  }
}