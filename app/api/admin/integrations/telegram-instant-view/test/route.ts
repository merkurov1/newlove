import { verifyInstantViewSession } from '@/lib/telegram/instantViewAuth';
import {
  instantViewErrorResponse,
  instantViewJson,
  invalidJsonRequest,
  requireInstantViewOwner,
  requiresJsonRequest,
} from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await requireInstantViewOwner(request);
    if (!requiresJsonRequest(request)) return invalidJsonRequest();

    const status = await verifyInstantViewSession();
    return instantViewJson({ ok: true, ...status });
  } catch (error) {
    return instantViewErrorResponse(error);
  }
}
