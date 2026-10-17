import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { extractPreview } from '@/lib/journal/preview';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 20;

function mapLetter(letter: any) {
  const lang = String(letter.lang || '').trim();

  return {
    id: String(letter.id),
    title: String(letter.title || 'Untitled'),
    slug: String(letter.slug || ''),
    preview:
      extractPreview(letter.content, letter.payload, 280) ||
      (letter.kind === 'issue'
        ? /^en/i.test(lang)
          ? 'Flow newspaper issue.'
          : 'Газетный выпуск Flow.'
        : ''),
    publishedAt: letter.publishedAt || null,
    sentAt: letter.sentAt || null,
    createdAt: letter.createdAt || null,
    kind: letter.kind || 'letter',
    lang: lang || null,
    number: letter.number == null ? null : Number(letter.number),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);

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
      'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,status,number,payload';

    const columnsWithoutPayload =
      'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,status,number';

    async function runQuery(columns: string) {
      let query: any = supabase
        .from('letters')
        .select(columns)
        .eq('published', true)
        .or('kind.is.null,kind.neq.issue');

      if (lang === 'en') {
        query = query.ilike('lang', 'en%');
      } else if (lang === 'ru') {
        query = query.or('lang.is.null,lang.ilike.ru%');
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
        { error: 'Не удалось загрузить публикации.' },
        { status: 500 },
      );
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    const hasMore = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);
    const articles = pageRows.map(mapLetter);

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
      { error: 'Внутренняя ошибка при загрузке журнала.' },
      { status: 500 },
    );
  }
}