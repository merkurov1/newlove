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
    async jwt({ token, user }) {
      // <<< КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Вся эта логика выполняется ТОЛЬКО ПРИ ПЕРВОМ ВХОДЕ >>>
      if (user) {
        // 1. Добавляем роль в токен
        token.role = user.role;
        
        // 2. Создаем специальный токен для Supabase
        const supabaseJwt = sign(
          {
            aud: 'authenticated',
            exp: Math.floor(new Date().getTime() / 1000) + 60 * 60 * 24 * 30, // Токен живет 30 дней
            sub: user.id,
            email: user.email,
            role: 'authenticated',
          },
          process.env.SUPABASE_JWT_SECRET!
        );
        
        // 3. Добавляем токен Supabase в JWT
        token.supabaseAccessToken = supabaseJwt;
      }
      // На всех последующих вызовах мы просто возвращаем уже существующий токен
      return token;
    },
    async session({ session, token }) {
      // Эта часть остается почти без изменений
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as Role;
      }
      
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


