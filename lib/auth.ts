// lib/auth.ts (ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ: ПРАВИЛЬНЫЙ ИМПОРТ ДЛЯ V5)

import { PrismaAdapter } from "@auth/prisma-adapter";
// ИСПРАВЛЕНО: Импортируем типы из 'next-auth', но сам getServerSession будем импортировать отдельно.
import { NextAuthConfig, Session, User } from "next-auth"; 
// Дополнительный импорт для функций аутентификации на сервере
import { getServerSession } from "next-auth/next"; 

import GoogleProvider from "next-auth/providers/google";
import prisma from "./prisma"; 

// Используем NextAuthConfig для конфигурации
export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, user }: { session: Session, user: User }) {
      if (session.user) {
        (session.user as any).id = user.id; 
      }
      return session;
    },
  },
};

// Функция auth() для получения сессии в Server Components
export async function auth() {
    // ВАЖНО: Мы используем прямой импорт getServerSession выше.
    // Теперь функция должна работать без динамического импорта.
    return getServerSession(authConfig as any); 
}

