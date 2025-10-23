"use client";
import { useEffect, useState } from 'react';

export default function useServerEffectiveRole(session: any | null) {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    if (!session) {
      setRole(null);
      return () => { mounted = false; };
    }
    const check = async () => {
      try {
        // Use cookie-based same-origin auth so server/middleware and client agree
        const res = await fetch('/api/user/role', { credentials: 'same-origin' });
        if (!mounted) return;
        if (!res.ok) return;
        const j = await res.json().catch(() => null);
        if (j && j.role) setRole(String(j.role).toUpperCase());
      } catch (e) {
        // ignore
      }
    };
    check();
    return () => { mounted = false; };
  }, [session]);
  return role;
}
