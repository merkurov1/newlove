// lib/auth.ts (ФИНАЛЬНО ИСПРАВЛЕННЫЙ ТИПИЗАЦИЯ)

import { PrismaAdapter } from "@auth/prisma-adapter";
// ИСПРАВЛЕНО: В v5 импорт типа может быть изменен или удален.
// Чтобы обойти это, мы импортируем только то, что нужно, и полагаемся на вывод.
import NextAuth, { NextAuthConfig, Session, User } from "next-auth"; 
import GoogleProvider from "next-auth/providers/google";
import prisma from "./prisma"; 

// Используем NextAuthConfig, который более точно соответствует v5, 
// или приводим к AuthOptions, если он все еще существует, но экспортируется иначе.
// Я использую NextAuthConfig, который должен быть корректным типом для v5.
export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    // В v5 session и user могут иметь другие типы, но мы приводим их, 
    // чтобы не ломать логику.
    async session({ session, user }: { session: Session, user: User }) {
      if (session.user) {
        // Убедитесь, что user.id корректно передается в session.user.id
        (session.user as any).id = user.id; 
      }
      return session;
    },
  },
};

// Функция auth() для получения сессии в Server Components
// Используем getServerSession с нашей конфигурацией.
export async function auth() {
    const { getServerSession } = await import("next-auth");
    // Здесь мы используем authConfig, который теперь имеет корректный тип.
    return getServerSession(authConfig as any); 
}

