/**
 * Public-name consent is an explicit, local choice. It is off by default and
 * applies only to future ritual traces; it never retroactively reveals a name
 * stored by an earlier visit.
 */
export const TEMPLE_PUBLIC_IDENTITY_KEY = 'temple:public-identity:v1';

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem' | 'removeItem'>;

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPublicIdentityPreference(
  storage: ReadableStorage | null = safeStorage()
): boolean {
  if (!storage) return false;

  try {
    return storage.getItem(TEMPLE_PUBLIC_IDENTITY_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writePublicIdentityPreference(
  value: boolean,
  storage: WritableStorage | null = safeStorage()
): void {
  if (!storage) return;

  try {
    if (value) {
      storage.setItem(TEMPLE_PUBLIC_IDENTITY_KEY, 'true');
    } else {
      storage.removeItem(TEMPLE_PUBLIC_IDENTITY_KEY);
    }
  } catch {
    // Private webviews can block localStorage. Public names stay off.
  }
}
