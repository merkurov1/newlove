// lib/auth.ts (NextAuth v5 совместимый код)

import { PrismaAdapter } from “@auth/prisma-adapter”;
import type { NextAuthConfig, Session, User } from “next-auth”;
import GoogleProvider from “next-auth/providers/google”;
import prisma from “./prisma”;
import NextAuth from “next-auth”;

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
async session({ session, user }: { session: Session; user: User }) {
if (session.user) {
(session.user as any).id = user.id;
}
return session;
},
},
pages: {
signIn: ‘/auth/signin’,
error: ‘/auth/error’,
},
};

// 2. Инициализируем NextAuth
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

// 3. Экспортируем handlers для API routes
export const { GET, POST } = handlers;