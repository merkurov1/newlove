import { loadInstantViewStatus } from '@/lib/telegram/instantViewAuth';
import { instantViewErrorResponse, instantViewJson, requireInstantViewOwner } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireInstantViewOwner(request);
    const status = await loadInstantViewStatus();
    return instantViewJson({ ok: true, ...status });
  } catch (error) {
    return instantViewErrorResponse(error);
  }
}
