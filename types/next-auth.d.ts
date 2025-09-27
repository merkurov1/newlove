// types/next-auth.d.ts

import NextAuth, { type DefaultSession } from "next-auth";

declare module "next-auth" {
  /**
   * Расширяем стандартный тип Session, добавляя наши кастомные поля
   */
  interface Session {
    user: {
      id: string;
      role: string; // Добавляем поле role
    } & DefaultSession["user"]; // Сохраняем стандартные поля (name, email, image)
  }

  /**
   * Расширяем стандартный тип User, чтобы он соответствовал нашей Prisma-модели
   */
  interface User {
    role: string; // Добавляем поле role
  }
}
