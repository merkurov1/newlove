// Minimal types used in the repo while migrating away from next-auth.

export enum Role {
  USER = 'user',
  ADMIN = 'admin',
  SUBSCRIBER = 'subscriber',
  PATRON = 'patron',
  PREMIUM = 'premium',
  SPONSOR = 'sponsor',
}

export type RoleType = Role | undefined;

declare module 'next-auth' {
  interface Session {
    supabaseAccessToken?: string;
    user?: any;
  }
}
