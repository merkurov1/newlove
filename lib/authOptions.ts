// lib/authOptions.ts

import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import prisma from '@/lib/prisma';
import { sign } from 'jsonwebtoken';
import { Role } from '@/types/next-auth.d';

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
        authToken: { label: 'Privy Auth Token', type: 'text' },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.authToken) {
            console.error('Privy authorize: no authToken');
            return null;
          }
          const res = await fetch(`${process.env.NEXTAUTH_URL}/api/privy-auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authToken: credentials.authToken }),
          });
          const data = await res.json();
          if (!res.ok || !data?.prismaUser) {
            console.error('Privy authorize: no prismaUser', { status: res.status, data });
            return null;
          }
          // NextAuth ожидает user с id, email и т.д.
          const user = {
            id: data.prismaUser.id,
            email: data.prismaUser.email,
            name: data.prismaUser.name,
            image: data.prismaUser.image,
            role: data.prismaUser.role,
            username: data.prismaUser.username,
            bio: data.prismaUser.bio,
            website: data.prismaUser.website,
            walletAddress: data.prismaUser.walletAddress,
          };
          console.log('Privy authorize: user', user);
          return user;
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
  // session.user.walletAddress = user.walletAddress; // убрано для совместимости с типами NextAuth
  // session.walletAddress = user.walletAddress; // убрано для совместимости с типами NextAuth
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
