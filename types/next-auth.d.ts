// types/next-auth.d.ts

import NextAuth, { DefaultSession } from "next-auth"

// Расширяем стандартный интерфейс Session
declare module "next-auth" {
  interface Session {
    user: {
      /** ID пользователя из базы данных */
      id: string;
    } & DefaultSession["user"]; // Добавляем id к стандартным полям (name, email, image)
  }
}
