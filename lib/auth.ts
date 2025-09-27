// lib/auth.ts (NextAuth v5 совместимый код)

import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import prisma from "./prisma";
import NextAuth from "next-auth";

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
    // Этот колбэк вызывается каждый раз, когда запрашивается сессия (например, через auth())
    async session({ session, user }) {
      // `user` здесь - это пользователь из вашей базы данных Prisma
      if (session.user) {
        session.user.id = user.id;
        // <<< ГЛАВНОЕ ИЗМЕНЕНИЕ: Добавляем роль пользователя в объект сессии
        session.user.role = user.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};

// 2. Инициализируем NextAuth
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

// 3. Экспортируем handlers для API routes
export const { GET, POST } = handlers;
