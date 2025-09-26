import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig, Session, User } from "next-auth"; // Используем type import
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
// Эта функция импортируется во всем приложении (@/lib/auth)
export async function auth() {
    // ВАЖНО: NextAuth v5 требует динамического импорта getServerSession
    // для корректной работы с App Router, иначе возникают ошибки компиляции.
    const { getServerSession } = await import("next-auth/next");
    return getServerSession(authConfig as any); 
}

