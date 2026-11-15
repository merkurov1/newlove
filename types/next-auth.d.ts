// Minimal types used in the repo while migrating away from next-auth.

import type { Role } from '@/lib/roles';

export type { Role };
export type RoleType = Role | undefined;

declare module 'next-auth' {
  interface Session {
    supabaseAccessToken?: string;
    user?: any;
  }
}
