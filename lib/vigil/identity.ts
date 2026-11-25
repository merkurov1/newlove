/**
 * Vigil identity is the shared Temple identity.
 *
 * This module is kept as the historical import path for Vigil callers and
 * tests; the implementation lives in `lib/temple/identity.ts` so every ritual
 * uses one verification and namespace policy.
 */
export {
  resolveTempleIdentity as resolveVigilIdentity,
  type TempleIdentity as VigilIdentity,
} from '@/lib/temple/identity';
