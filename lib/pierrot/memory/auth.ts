import { assertServerOnly } from '@/lib/serverOnly';
import { getCurrentUser, requireAdminFromRequest } from '@/lib/serverAuth';
import { isVerifiedOwnerCredential, isVerifiedOwnerUser } from '@/lib/knowledge/rag/authorization';
import { isPierrotUserId } from '@/lib/pierrot/identity';

assertServerOnly('lib/pierrot/memory/auth');

/**
 * Resolves a real auth.users id for owner memory.
 *
 * Client flags, visitor ids and the service `system-admin` identity are never
 * accepted. Telegram webhook owners without a Supabase user id cannot access
 * memory because `pierrot_decisions.user_id` is an auth.users foreign key.
 */
export async function resolveMemoryOwner(req: Request): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    if (isVerifiedOwnerUser(user) && isPierrotUserId(user?.id)) return user.id;
  } catch {
    // Fall through to explicit credentials.
  }

  const hasCredential =
    Boolean(req.headers.get('authorization')) || Boolean(req.headers.get('x-telegram-init-data'));

  if (!hasCredential) return null;

  try {
    const admin = await requireAdminFromRequest(req);
    if (isVerifiedOwnerCredential(admin) && isPierrotUserId(admin.id)) return admin.id;
  } catch {
    return null;
  }

  return null;
}
