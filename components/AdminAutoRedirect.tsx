// components/AdminAutoRedirect.tsx
"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from '@/components/AuthContext';

export default function AdminAutoRedirect() {
  const { session, isLoading } = useAuth();
  const status = isLoading ? 'loading' : (session ? 'authenticated' : 'unauthenticated');
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "ADMIN") {
      // Если находимся не на /admin, редиректим
      if (pathname !== "/admin") {
        router.replace("/admin");
      }
    }
  }, [status, session, pathname, router]);

  return null;
}
