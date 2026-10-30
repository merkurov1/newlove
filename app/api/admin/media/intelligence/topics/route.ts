import { loadMediaIntelligenceTopics } from '@/lib/analytics/mediaIntelligence';
import {
  authorizeMediaIntelligence,
  filtersFromRequest,
  mediaIntelligenceError,
  mediaIntelligenceJson,
} from '@/lib/analytics/mediaIntelligenceRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeMediaIntelligence(request);
  if (!auth.ok) return mediaIntelligenceJson({ error: 'Unauthorized' }, 401);

  try {
    return mediaIntelligenceJson({
      status: 'ok',
      data: await loadMediaIntelligenceTopics(filtersFromRequest(request)),
    });
  } catch (error) {
    return mediaIntelligenceError(error);
  }
}
