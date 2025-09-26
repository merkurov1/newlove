// lib/auth.ts (ФИНАЛЬНО ИСПРАВЛЕННЫЙ СИНТАКСИС)

import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { AuthOptions } from "next-auth";
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
        // Убедимся, что ID присваивается
        session.user.id = user.id; 
      }
      return session;
    },
  },
};

// 2. Экспортируем handler для роут-хендлеров app/api/auth/[...nextauth]/route.ts
export const handler = NextAuth(authConfig);

// 3. Создаем и экспортируем функцию auth() для Server Components 
// и Route Handlers (app/talks/page.tsx, app/api/messages/route.ts)
// Мы используем getServerSession в качестве обходного пути, так как 
// прямой импорт 'auth' из 'next-auth' не работает на Vercel.
export async function auth() {
    // Импортируем getServerSession динамически, чтобы избежать ошибок Next.js
    const { getServerSession } = await import("next-auth");
    return getServerSession(authConfig);
}

