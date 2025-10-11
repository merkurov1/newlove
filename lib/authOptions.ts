// lib/authOptions.ts

import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import prisma from '@/lib/prisma';
import { sign } from 'jsonwebtoken';
import { Role } from '@/types/next-auth.d';

// Расширяем типы NextAuth для поддержки walletAddress
import NextAuth, { DefaultSession, DefaultUser } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role?: Role | undefined;
      username?: string | null | undefined;
      bio?: string | null | undefined;
      website?: string | null | undefined;
    } & DefaultSession['user'];
  }
  interface User extends DefaultUser {
    role?: Role | undefined;
    username?: string | null | undefined;
    bio?: string | null | undefined;
    website?: string | null | undefined;
    walletAddress?: string | null | undefined;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      id: 'privy',
      name: 'Privy',
      credentials: {
        accessToken: { label: 'Privy Access Token', type: 'text' },
      },
      async authorize(credentials) {
        // ...existing code...
        if (!credentials?.accessToken) {
          console.error('Privy authorize: No access token provided');
          return null;
        }
        try {
          const { PrivyClient } = await import('@privy-io/server-auth');
          const privy = new PrivyClient(
            process.env.PRIVY_APP_ID!,
            process.env.PRIVY_APP_SECRET!
          );
          const claims = await privy.verifyAuthToken(credentials.accessToken);
          const userId = claims.userId;
          if (!userId) {
            console.error('Privy authorize: Token verification failed, no userId');
            return null;
          }
          // Получаем профиль пользователя из Privy
          let privyUser;
          try {
            privyUser = await privy.getUser(userId);
            // DEBUG: выводим структуру privyUser для анализа
            console.log('Privy authorize: privyUser =', privyUser);
          } catch (e) {
            console.error('Privy authorize: getUser failed', e);
            return null;
          }
          const walletAddress = privyUser?.wallet?.address?.toLowerCase() || null;
          let email = privyUser?.email?.address?.toLowerCase() || null;
          if (!email && walletAddress) {
            email = `wallet_${walletAddress}@privy.local`;
          }
          // Собираем данные для создания/обновления пользователя
          // Корректно получаем имя и аватарку из privyUser
          let userData = {
            id: userId,
            email,
            walletAddress,
            // name и image будут добавлены после уточнения структуры privyUser
          };
          // 1. Пытаемся найти пользователя по DID
          let user = await prisma.user.findUnique({ where: { id: userId } });
          // 2. Если не найден — ищем по email (если есть)
          if (!user && email) {
            user = await prisma.user.findUnique({ where: { email } });
            // Если найден по email, обновляем его DID и walletAddress
            if (user) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: {
                  id: userId,
                  walletAddress,
                  // name и image будут добавлены после уточнения структуры privyUser
                },
              });
            }
          }
          // 3. Если не найден — ищем по walletAddress (если есть)
          if (!user && walletAddress) {
            user = await prisma.user.findFirst({ where: { walletAddress } });
            if (user) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: {
                  id: userId,
                  email,
                  // name и image будут добавлены после уточнения структуры privyUser
                },
              });
            }
          }
          // 4. Если не найден — создаём нового
          if (!user) {
            user = await prisma.user.create({ data: userData });
          }
          // 5. Возвращаем только нужные поля
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role as Role | undefined,
            username: user.username,
            bio: user.bio,
            website: user.website,
            walletAddress: user.walletAddress,
          };
        } catch (error) {
          console.error('Privy authorize error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      try {
        if (!user?.id) {
          console.error('Session callback: user.id отсутствует', user);
          return session;
        }
        const supabaseJwt = sign(
          {
            aud: 'authenticated',
            exp: Math.floor(new Date().getTime() / 1000) + 60 * 60 * 24 * 7,
            sub: user.id,
            email: user.email,
            role: 'authenticated',
          },
          process.env.SUPABASE_JWT_SECRET!
        );
        session.supabaseAccessToken = supabaseJwt;
    session.user.id = user.id;
    session.user.role = user.role as Role;
    session.user.username = user.username;
    session.user.bio = user.bio;
    session.user.website = user.website;
  (session.user as any).walletAddress = user.walletAddress;
        console.log('Session callback: session', session);
        return session;
      } catch (e) {
        console.error('Session callback error', e);
        return session;
      }
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
