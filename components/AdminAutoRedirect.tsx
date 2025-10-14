// components/AdminAutoRedirect.tsx
"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSupabaseSession from "@/hooks/useSupabaseSession";

export default function AdminAutoRedirect() {
  const { session, status } = useSupabaseSession();
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
