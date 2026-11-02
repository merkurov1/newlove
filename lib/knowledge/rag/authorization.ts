/**
 * Owner-only manuscript retrieval authorization.
 *
 * These helpers are deliberately narrower than the existing admin gate:
 * shared service secrets are not user identities and must not unlock the
 * owner manuscript index.
 */

export type RagOwnerIdentity = {
  id?: string | null;
  role?: string | null;
};

/** A verified Supabase profile whose authoritative role is ADMIN. */
export function isVerifiedOwnerUser(user: RagOwnerIdentity | null | undefined): boolean {
  return user?.role === 'ADMIN';
}

/**
 * A verified user/admin credential from requireAdminFromRequest().
 *
 * `system-admin` is the dedicated x-admin-secret service identity and is
 * excluded. Telegram, Bearer JWT and cookie-session identities have a real
 * user or Telegram id.
 */
export function isVerifiedOwnerCredential(admin: RagOwnerIdentity | null | undefined): boolean {
  if (!admin || admin.role !== 'ADMIN') return false;
  if (!admin.id) return false;

  return admin.id !== 'system-admin';
}

/**
 * Telegram webhook requests reach the shared Pierrot backend server-to-server.
 * They cannot carry Mini App initData, so the existing allowed-user list and
 * the shared internal secret are used together. Neither header alone is
 * sufficient, and the legacy `x-admin-key` remains non-authoritative.
 */
export function isVerifiedTelegramOwnerRequest(input: {
  internalRequest: boolean;
  telegramOwnerId: string | null | undefined;
  allowedUserIds?: string[] | null;
}): boolean {
  if (!input.internalRequest) return false;

  const ownerId = typeof input.telegramOwnerId === 'string' ? input.telegramOwnerId.trim() : '';

  if (!/^\d+$/.test(ownerId)) return false;

  const allowed = Array.isArray(input.allowedUserIds)
    ? input.allowedUserIds
    : (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

  return allowed.includes(ownerId);
}
