// lib/authOptions.ts

import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import prisma from '@/lib/prisma';
import { sign } from 'jsonwebtoken';
import { Role } from '@/types/next-auth.d';

// Расширяем типы NextAuth для поддержки walletAddress
import NextAuth, { DefaultSession, DefaultUser } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role?: Role | undefined;
      username?: string | null | undefined;
      bio?: string | null | undefined;
      website?: string | null | undefined;
    } & DefaultSession['user'];
  }
  interface User extends DefaultUser {
    role?: Role | undefined;
    username?: string | null | undefined;
    bio?: string | null | undefined;
    website?: string | null | undefined;
    walletAddress?: string | null | undefined;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      id: 'privy',
      name: 'Privy',
      credentials: {
        accessToken: { label: 'Privy Access Token', type: 'text' },
      },
      async authorize(credentials) {
        const accessToken = credentials?.accessToken;
        if (!accessToken) return null;
        try {
          const { PrivyClient } = await import('@privy-io/server-auth');
          const privy = new PrivyClient(
            process.env.PRIVY_APP_ID!,
            process.env.PRIVY_APP_SECRET!
          );
          const claims = await privy.verifyAuthToken(accessToken);
          if (!claims?.userId) return null;
          // const privyUser = await privy.getUser(claims.userId); // если нужно
          return {
            id: claims.userId,
            // email: privyUser?.email?.address, // если нужно
            // name: privyUser?.name, // если нужно
          };
        } catch (e) {
          console.error('Privy authorize error', e);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      try {
        if (!user?.id) {
          console.error('Session callback: user.id отсутствует', user);
          return session;
        }
        const supabaseJwt = sign(
          {
            aud: 'authenticated',
            exp: Math.floor(new Date().getTime() / 1000) + 60 * 60 * 24 * 7,
            sub: user.id,
            email: user.email,
            role: 'authenticated',
          },
          process.env.SUPABASE_JWT_SECRET!
        );
        session.supabaseAccessToken = supabaseJwt;
    session.user.id = user.id;
    session.user.role = user.role as Role;
    session.user.username = user.username;
    session.user.bio = user.bio;
    session.user.website = user.website;
  (session.user as any).walletAddress = user.walletAddress;
        console.log('Session callback: session', session);
        return session;
      } catch (e) {
        console.error('Session callback error', e);
        return session;
      }
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
