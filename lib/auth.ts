// lib/auth.ts (ФИНАЛЬНО ИСПРАВЛЕННЫЙ КОНФИГ)

import { PrismaAdapter } from "@auth/prisma-adapter";
// Обратите внимание: импортируем только AuthOptions, а getServerSession нужен для функции auth()
import { AuthOptions } from "next-auth"; 
import GoogleProvider from "next-auth/providers/google";
import prisma from "./prisma"; 

// 1. Создаем объект конфигурации
export const authConfig: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id; 
      }
      return session;
    },
  },
};

// 2. Функция auth() для Server Components и Route Handlers.
// Использует динамический импорт, чтобы избежать конфликтов при сборке.
export async function auth() {
    // Импортируем getServerSession динамически, чтобы пройти компиляцию
    const { getServerSession } = await import("next-auth");
    return getServerSession(authConfig);
}

// УДАЛЕНО: export const handler = NextAuth(authConfig);
// Мы будем создавать NextAuth-обработчик локально в route.ts

