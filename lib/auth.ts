// lib/auth.ts

import { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { SupabaseAdapter } from "@auth/supabase-adapter";
import { createClient } from "@supabase/supabase-js";

// Убедитесь, что ваш Supabase клиент здесь тоже создается для адаптера
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  adapter: SupabaseAdapter({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }),

  // <-- НАЧАЛО ВАЖНЫХ ИЗМЕНЕНИЙ -->
  callbacks: {
    async session({ session, user }) {
      // Эта функция вызывается каждый раз, когда запрашивается сессия.
      // Мы берем ID пользователя из базы (который SupabaseAdapter сделал равным UUID)
      // и добавляем его в объект сессии, который будет доступен на клиенте.
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  // <-- КОНЕЦ ВАЖНЫХ ИЗМЕНЕНИЙ -->
};
