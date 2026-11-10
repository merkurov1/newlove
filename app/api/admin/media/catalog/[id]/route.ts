import { getMediaRecordDetail } from '@/lib/knowledge/media/catalog';
import {
  authorizeMediaIntelligence,
  mediaIntelligenceError,
  mediaIntelligenceJson,
} from '@/lib/analytics/mediaIntelligenceRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeMediaIntelligence(request);
  if (!auth.ok) return mediaIntelligenceJson({ error: 'Unauthorized' }, 401);

  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return mediaIntelligenceJson({ error: 'Invalid media record id.' }, 400);
  }

  try {
    const detail = await getMediaRecordDetail({ id, maxTextChars: 60_000 });

    if (detail.status === 'not_found') {
      return mediaIntelligenceJson({ error: 'Media record not found.' }, 404);
    }

    return mediaIntelligenceJson({ status: 'ok', data: detail });
  } catch (error) {
    return mediaIntelligenceError(error);
  }
}
