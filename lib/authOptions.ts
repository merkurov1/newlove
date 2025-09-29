// lib/authOptions.ts

import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
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
  ],
  callbacks: {
    async session({ session, user }) {
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

      // --- ДОБАВЛЯЕМ НОВЫЕ ПОЛЯ В СЕССИЮ ---
      session.user.id = user.id;
      session.user.role = user.role as Role;
      session.user.username = user.username; // Добавляем username
      session.user.bio = user.bio;           // Добавляем bio
      session.user.website = user.website;   // Добавляем website

      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
