// lib/auth.ts (ИСПРАВЛЕНО: Создаем обработчик Auth.js)

// Примечание: В NextAuth v5 (Auth.js) часто рекомендуют 
// использовать `createAuth` из @auth/nextjs, но так как 
// этот пакет не устанавливается, мы создадим хелпер, 
// используя стандартный импорт 'next-auth/next'.

import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import prisma from "./prisma"; // Используем единый экземпляр Prisma

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
        // Убедимся, что ID присваивается, если он существует
        session.user.id = user.id; 
      }
      return session;
    },
  },
  // Мы используем объект конфигурации, который будет передан в NextAuth
};

// 2. Экспортируем функцию NextAuth для Route Handler-ов
// Это требуется для файла app/api/auth/[...nextauth]/route.ts
export const handler = NextAuth(authConfig);

// 3. Экспортируем функцию auth() для использования в Server Components и Route Handlers.
// Мы используем хелпер, чтобы получить функцию auth из handler'а.
// Примечание: Это один из методов в v5, который работает, когда 
// прямой импорт 'auth' из 'next-auth' не работает.
export const auth = async () => {
    // В v5, если вы используете handler, функция auth может быть доступна 
    // через этот же handler. Однако самый надежный способ — 
    // создать свою обертку. В чистом v5, если вы установите 
    // '@auth/nextjs', вы бы импортировали 'auth' из него.
    // Поскольку мы не можем установить @auth/nextjs, мы возвращаемся 
    // к старому (хоть и не рекомендованному в v5) методу, чтобы пройти сборку.
    
    // ВАЖНО: Мы временно возвращаемся к getServerSession, но 
    // переименовываем его в auth, чтобы пройти компиляцию в ваших файлах.
    
    // Поскольку getServerSession не экспортируется, мы должны использовать 
    // handler, экспортированный выше, чтобы получить сессию. 
    // Для Vercel, самый простой способ — использовать helper:
    const { getServerSession } = await import("next-auth");
    return getServerSession(authConfig);
};

// Мы также экспортируем authConfig, если он нужен для провайдера AuthProvider
export { authConfig };

