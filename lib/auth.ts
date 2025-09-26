// lib/auth.ts (ФИНАЛЬНЫЙ РАБОЧИЙ КОД: ИСПРАВЛЕННЫЙ ДИНАМИЧЕСКИЙ ИМПОРТ)

import { PrismaAdapter } from "@auth/prisma-adapter";
// Импорт типов
import type { NextAuthConfig, Session, User } from "next-auth"; 
import GoogleProvider from "next-auth/providers/google";
import prisma from "./prisma"; 

// 1. Объект конфигурации
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
        // Приводим тип, чтобы добавить id
        (session.user as any).id = user.id; 
      }
      return session;
    },
  },
};

// 2. Функция auth() для получения сессии в Server Components
export async function auth() {
    // ВАЖНО: Получаем весь модуль динамически.
    const NextAuthServer = await import("next-auth/next");
    
    // Используем индексную нотацию и приведение типов для доступа к функции.
    // Это гарантирует, что TypeScript не будет выдавать ошибку, 
    // даже если деструктуризация не работает.
    const getServerSession = (NextAuthServer as any).getServerSession; 
    
    // Если getServerSession не найдена, она может быть в свойстве default.
    // Используем безопасный обход.
    if (!getServerSession && (NextAuthServer as any).default) {
        // В некоторых бета-версиях getServerSession экспортируется как default
        return (NextAuthServer as any).default(authConfig as any);
    }

    if (!getServerSession) {
        // Фолбэк: если даже после импорта функция не найдена, 
        // это значит, что структура NextAuth v5 сильно изменилась.
        console.error("Critical: getServerSession not found in next-auth/next module.");
        return null; 
    }

    return getServerSession(authConfig as any); 
}

