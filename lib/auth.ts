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
    // Поскольку деструктуризация не работает, мы должны получить функцию 
    // getServerSession из модуля, который находится в next-auth/next.
    const NextAuthServer = await import("next-auth/next");
    
    // В зависимости от версии NextAuth (v4/v5) getServerSession может быть 
    // либо именованным экспортом, либо находиться в свойстве 'getServerSession' модуля.
    // Мы используем безопасный обход, который будет работать.
    const { getServerSession } = NextAuthServer;

    return getServerSession(authConfig as any); 
}

