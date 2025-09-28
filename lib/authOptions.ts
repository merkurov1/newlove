import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import prisma from '@/lib/prisma';
import { sign } from 'jsonwebtoken';
import { Role } from '@/types/next-auth.d'; // <<< 1. Импортируем наш enum

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      
      const supabaseJwt = sign(
        {
          aud: 'authenticated',
          exp: Math.floor(new Date().getTime() / 1000) + 60 * 60,
          sub: user.id,
          email: user.email,
          role: 'authenticated',
        },
        process.env.SUPABASE_JWT_SECRET!
      );
      
      token.supabaseAccessToken = supabaseJwt;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        // <<< 2. ЯВНО УКАЗЫВАЕМ ТИП >>>
        // Мы говорим TypeScript: "Мы уверены, что token.role имеет тип Role"
        session.user.role = token.role as Role;
      }
      
      // <<< 3. И ЗДЕСЬ ТОЖЕ УКАЗЫВАЕМ ТИП >>>
      session.supabaseAccessToken = token.supabaseAccessToken as string;
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  secret: process.env.NEXTAUTH_SECRET,
};


