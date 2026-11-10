import {
  getMediaArchiveStats,
  listMediaCatalog,
  type MediaCatalogFilters,
  type MediaScope,
} from '@/lib/knowledge/media/catalog';
import {
  authorizeMediaIntelligence,
  mediaIntelligenceError,
  mediaIntelligenceJson,
} from '@/lib/analytics/mediaIntelligenceRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function text(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function int(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function scope(value: string | null): MediaScope {
  return value === 'own' || value === 'mentions' ? value : 'all';
}

function filtersFromParams(params: URLSearchParams): MediaCatalogFilters {
  return {
    scope: scope(params.get('scope')),
    year: int(params.get('year')),
    month: int(params.get('month')),
    from: text(params.get('from')),
    to: text(params.get('to')),
    outlet: text(params.get('outlet')),
    language: text(params.get('language')),
    topic: text(params.get('topic')),
    kind: text(params.get('kind')),
    author: text(params.get('author')),
    title: text(params.get('title')),
    query: text(params.get('q')),
    status:
      params.get('status') === 'draft' ||
      params.get('status') === 'all' ||
      params.get('status') === 'published'
        ? (params.get('status') as 'draft' | 'all' | 'published')
        : 'published',
    foreign: params.get('foreign') === '1' || params.get('foreign') === 'true',
  };
}

export async function GET(request: Request) {
  const auth = await authorizeMediaIntelligence(request);
  if (!auth.ok) return mediaIntelligenceJson({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const filters = filtersFromParams(url.searchParams);

  try {
    if (url.searchParams.get('view') === 'stats') {
      return mediaIntelligenceJson({
        status: 'ok',
        data: await getMediaArchiveStats(filters),
      });
    }

    const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = Number.parseInt(url.searchParams.get('pageSize') || '50', 10);
    const data = await listMediaCatalog({ filters, page, pageSize });

    return mediaIntelligenceJson({ status: 'ok', data });
  } catch (error) {
    return mediaIntelligenceError(error);
  }
}

export async function POST(request: Request) {
  const auth = await authorizeMediaIntelligence(request);
  if (!auth.ok) return mediaIntelligenceJson({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const input =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' || typeof value === 'number') {
      params.set(key, String(value));
    }
  }

  const filters = filtersFromParams(params);

  try {
    const page = typeof input.page === 'number' ? input.page : 1;
    const pageSize = typeof input.pageSize === 'number' ? input.pageSize : 50;
    const data = await listMediaCatalog({ filters, page, pageSize });
    return mediaIntelligenceJson({ status: 'ok', data });
  } catch (error) {
    return mediaIntelligenceError(error);
  }
}
