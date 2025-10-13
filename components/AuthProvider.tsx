// components/AuthProvider.tsx

"use client";

import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

// Previously used next-auth's SessionProvider. We now use Supabase hooks directly.
export default function AuthProvider({ children }: Props) {
  return <>{children}</>;
}
