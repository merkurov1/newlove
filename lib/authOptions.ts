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
  // <<< 1. УДАЛЯЕМ КОЛБЭК jwt >>>
  // Он не используется в стратегии "Database", которую включает Prisma Adapter.
  // Вся логика теперь находится в ОДНОМ колбэке - session().

  callbacks: {
    // <<< 2. РАБОТАЕМ С ОБЪЕКТОМ user, А НЕ token >>>
    // В стратегии "Database" этот колбэк получает { session, user }.
    async session({ session, user }) {
      
      // <<< 3. ВСЯ ЛОГИКА ТЕПЕРЬ ВНУТРИ ОДНОГО КОЛБЭКА >>>

      // а) Создаем специальный токен для Supabase, используя данные из объекта `user`
      const supabaseJwt = sign(
        {
          aud: 'authenticated',
          exp: Math.floor(new Date().getTime() / 1000) + 60 * 60 * 24 * 7, // Токен живет 7 дней
          sub: user.id,
          email: user.email,
          role: 'authenticated',
        },
        process.env.SUPABASE_JWT_SECRET!
      );
      
      // б) Добавляем токен Supabase в объект сессии
      session.supabaseAccessToken = supabaseJwt;

      // в) Добавляем наши кастомные поля в сессию из объекта `user`
      session.user.id = user.id;
      session.user.role = user.role as Role;

      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
