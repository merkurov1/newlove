import { requireAdminFromRequest } from '@/lib/serverAuth';

export type KnowledgeAdminAuthorization =
  | { ok: true; via: 'session' | 'github_owner'; actor: string }
  | { ok: false };

/**
 * Authorizes owner-only knowledge operations.
 *
 * Two existing, server-verified mechanisms are accepted:
 *   1. the application's admin session / Telegram / Supabase JWT gate;
 *   2. the GitHub owner token already used by the production UNFRAMED admin
 *      endpoint, where the GitHub login must equal the repository owner.
 *
 * Client-provided admin flags are never consulted.
 */
export async function authorizeKnowledgeAdmin(
  request: Request
): Promise<KnowledgeAdminAuthorization> {
  try {
    const admin = await requireAdminFromRequest(request);

    if (admin?.role === 'ADMIN') {
      return { ok: true, via: 'session', actor: admin.id };
    }
  } catch {
    // Fall through to the GitHub owner credential.
  }

  const header = request.headers.get('authorization') || '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (!token) return { ok: false };

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      cache: 'no-store',
    });

    if (!response.ok) return { ok: false };

    const user = (await response.json()) as { login?: unknown };
    const expected = (process.env.VERCEL_GIT_REPO_OWNER || 'merkurov1').toLowerCase();

    if (typeof user.login === 'string' && user.login.toLowerCase() === expected) {
      return { ok: true, via: 'github_owner', actor: user.login };
    }
  } catch {
    return { ok: false };
  }

  return { ok: false };
}
