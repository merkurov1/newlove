import {
  executeMediaIngestionRetries,
  planMediaIngestionRetries,
} from '@/lib/knowledge/media/retry';
import {
  authorizeMediaIntelligence,
  mediaIntelligenceError,
  mediaIntelligenceJson,
} from '@/lib/analytics/mediaIntelligenceRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function GET(request: Request) {
  const auth = await authorizeMediaIntelligence(request);
  if (!auth.ok) return mediaIntelligenceJson({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);

  try {
    return mediaIntelligenceJson({
      status: 'ok',
      data: await planMediaIngestionRetries({
        limit: Number.parseInt(url.searchParams.get('limit') || '50', 10),
        mediaRecordId: url.searchParams.get('id') || undefined,
      }),
    });
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

  const execute = input.execute === true;
  const limit =
    typeof input.limit === 'number' ? Math.trunc(input.limit) : Number.parseInt(String(input.limit || '3'), 10);

  try {
    const result = await executeMediaIngestionRetries({
      limit,
      mediaRecordId: typeof input.mediaRecordId === 'string' ? input.mediaRecordId : undefined,
      dryRun: !execute,
    });

    return mediaIntelligenceJson({ status: 'ok', data: result });
  } catch (error) {
    return mediaIntelligenceError(error);
  }
}
