import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import prisma from '@/lib/prisma';
import { sign } from 'jsonwebtoken';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  // <<< КЛЮЧЕВЫЕ ИЗМЕНЕНИЯ ЗДЕСЬ, В КОЛБЭКАХ >>>
  callbacks: {
    // Этот колбэк вызывается при создании JWT
    async jwt({ token, user }) {
      if (user) {
        // Добавляем роль пользователя в токен
        token.role = user.role;
      }
      
      // Создаем специальный токен для Supabase
      const supabaseJwt = sign(
        {
          aud: 'authenticated',
          exp: Math.floor(new Date().getTime() / 1000) + 60 * 60, // Токен живет 1 час
          sub: user.id,
          email: user.email,
          role: 'authenticated',
        },
        process.env.SUPABASE_JWT_SECRET!
      );
      
      token.supabaseAccessToken = supabaseJwt;
      return token;
    },
    // Этот колбэк вызывается при создании сессии
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role;
      }
      // Передаем токен Supabase в объект сессии, доступный на клиенте
      session.supabaseAccessToken = token.supabaseAccessToken;
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

