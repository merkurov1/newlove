// types/next-auth.d.ts

import "next-auth";

declare module "next-auth" {
  /**
   * Расширяем стандартный тип Session, добавляя в него поле `id`.
   */
  interface Session {
    user: {
      id: string; // ID пользователя теперь является частью типа User в сессии
    } & DefaultSession["user"];
  }
}
