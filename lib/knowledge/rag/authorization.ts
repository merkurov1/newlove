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
