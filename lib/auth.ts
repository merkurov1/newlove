// lib/auth.ts (ПОДТВЕРЖДЕННАЯ ВЕРСИЯ)

import { PrismaAdapter } from "@auth/prisma-adapter";
import { AuthOptions } from "next-auth"; 
import GoogleProvider from "next-auth/providers/google";
import prisma from "./prisma"; 

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

// Функция auth() для получения сессии в Server Components
export async function auth() {
    // Импортируем getServerSession динамически, чтобы пройти компиляцию
    const { getServerSession } = await import("next-auth");
    return getServerSession(authConfig);
}

// УДАЛЕНО: export const handler = NextAuth(authConfig);

