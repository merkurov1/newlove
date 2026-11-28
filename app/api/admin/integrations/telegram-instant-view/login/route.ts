import { loadInstantViewStatus, startInstantViewLogin } from '@/lib/telegram/instantViewAuth';
import {
  instantViewErrorResponse,
  instantViewJson,
  invalidJsonRequest,
  readJsonObject,
  requireInstantViewOwner,
  requiresJsonRequest,
} from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await requireInstantViewOwner(request);
    if (!requiresJsonRequest(request)) return invalidJsonRequest();

    const body = await readJsonObject(request);
    await startInstantViewLogin(body.phone);
    const status = await loadInstantViewStatus();
    return instantViewJson({ ok: true, ...status });
  } catch (error) {
    return instantViewErrorResponse(error);
  }
}
