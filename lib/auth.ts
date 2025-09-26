// lib/auth.ts

import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";
import { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// Создаем один экземпляр PrismaClient для всего приложения
const prisma = new PrismaClient();

export const authOptions: AuthOptions = {
  // Используем PrismaAdapter вместо SupabaseAdapter
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  // Коллбэк остается, он все еще нужен, чтобы добавить ID в сессию
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id; // user.id теперь приходит из Prisma
      }
      return session;
    },
  },
};
