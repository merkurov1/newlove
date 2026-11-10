import { getMediaDiagnostics } from '@/lib/knowledge/media/catalog';
import {
  authorizeMediaIntelligence,
  mediaIntelligenceError,
  mediaIntelligenceJson,
} from '@/lib/analytics/mediaIntelligenceRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeMediaIntelligence(request);
  if (!auth.ok) return mediaIntelligenceJson({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const includeHealthy = url.searchParams.get('includeHealthy') === '1';
  const limit = Number.parseInt(url.searchParams.get('limit') || '300', 10);

  try {
    return mediaIntelligenceJson({
      status: 'ok',
      data: await getMediaDiagnostics({ includeHealthy, limit }),
    });
  } catch (error) {
    return mediaIntelligenceError(error);
  }
}
