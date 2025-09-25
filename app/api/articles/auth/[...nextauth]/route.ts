// app/api/auth/[...nextauth]/route.ts

import NextAuth from "next-auth";
import type { AuthOptions } from "next-auth";

// Импортируйте ваших провайдеров, например, Google
import GoogleProvider from "next-auth/providers/google";

export const authOptions: AuthOptions = {
  // Настройте одного или нескольких провайдеров аутентификации
  providers: [
    GoogleProvider({
      // Убедитесь, что переменные окружения заданы
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
    // ...здесь могут быть другие провайдеры (GitHub, Yandex, etc.)
  ],

  // Стратегия сессии, JWT используется по умолчанию и необходим для колбэков ниже
  session: {
    strategy: "jwt",
  },

  // Колбэки для управления данными в токене и сессии
  callbacks: {
    /**
     * Этот колбэк вызывается при создании или обновлении JWT.
     * Мы добавляем ID пользователя в токен, чтобы он был доступен в колбэке `session`.
     */
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },

    /**
     * Этот колбэк вызывается при каждом обращении к сессии (например, через useSession).
     * Мы передаем данные из токена в объект `session`, доступный на клиенте.
     */
    async session({ session, token }) {
      // --- >>> ВОТ ОСНОВНОЕ ИСПРАВЛЕНИЕ <<< ---
      // Мы добавили проверку `if (token && session.user)`,
      // чтобы TypeScript был уверен, что `session.user` существует перед тем,
      // как мы попытаемся добавить к нему свойство `id`.
      if (token && session.user) {
        session.user.id = token.sub as string; // `token.sub` это и есть ID пользователя
      }
      // --- >>> КОНЕЦ ИСПРАВЛЕНИЯ <<< ---

      return session;
    },
  },

  // Здесь могут быть другие опции, например, кастомные страницы входа
  // pages: {
  //   signIn: '/login',
  // }
};

const handler = NextAuth(authOptions);

// Экспортируем хендлеры для GET и POST запросов
export { handler as GET, handler as POST };

