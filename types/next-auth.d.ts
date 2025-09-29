// types/next-auth.d.ts

import NextAuth, { DefaultSession, DefaultUser } from 'next-auth';
import { JWT } from 'next-auth/jwt';

export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

declare module 'next-auth' {
  interface User {
    role?: Role;
    username?: string | null;
    bio?: string | null;
    website?: string | null;
  }

  interface Session {
    user: {
      id: string;
      role?: Role;
      username?: string | null;
      bio?: string | null;
      website?: string | null;
    } & DefaultSession['user'];
    supabaseAccessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role?: Role;
    username?: string | null;
  }
}
