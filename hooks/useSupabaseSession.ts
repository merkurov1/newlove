"use client";
import { useEffect, useState } from 'react';

import { createClient as createBrowserClient } from '@/lib/supabase-browser';

// Use a single browser client factory so all components share the same
// auth state and subscriptions. Other components already import and call
// `createBrowserClient()` from `lib/supabase-browser.js`.


export default function useSupabaseSession() {
  const [session, setSession] = useState<any | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
  let mounted = true;
  const supabase = createBrowserClient();
    const get = async () => {
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      if (!mounted) return;
      if (s?.user) {
        const user = s.user;
        let role = user.user_metadata?.role || 'USER';
        // Проверяем user_roles только если явно нет ADMIN в user_metadata
        if (role !== 'ADMIN') {
          try {
            const { data: rolesData, error } = await supabase
              .from('user_roles')
              .select('role_id,roles(name)')
              .eq('user_id', user.id);
            if (!error && Array.isArray(rolesData)) {
              const hasAdmin = rolesData.some(r => {
                const roleList: any = r.roles;
                if (Array.isArray(roleList)) return roleList.some((roleObj: any) => roleObj.name === 'ADMIN');
                return roleList?.name === 'ADMIN';
              });
              if (hasAdmin) role = 'ADMIN';
            }
          } catch (e) {
            // ignore
          }
          // Если локальная проверка не подтвердила ADMIN, запросим серверную проверку
          if (role !== 'ADMIN' && typeof window !== 'undefined') {
            try {
              const res = await fetch('/api/user/role');
              if (res.ok) {
                const json = await res.json();
                if (json && json.role === 'ADMIN') role = 'ADMIN';
              }
            } catch (e) {
              // ignore
            }
          }
        }
        setSession({
          user: {
            id: user.id,
            email: user.email,
            name: user.user_metadata?.name || null,
            username: user.user_metadata?.username || null,
            image: user.user_metadata?.image || null,
            role,
          },
          accessToken: s.access_token,
        });
        setStatus('authenticated');
      } else {
        setSession(null);
        setStatus('unauthenticated');
      }
    };
    get();
  const { data: listener } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      if (s?.user) {
        const user = s.user;
        let role = user.user_metadata?.role || 'USER';
        if (role !== 'ADMIN') {
          try {
            const { data: rolesData, error } = await supabase
              .from('user_roles')
              .select('role_id,roles(name)')
              .eq('user_id', user.id);
            if (!error && Array.isArray(rolesData)) {
              const hasAdmin = rolesData.some(r => {
                const roleList: any = r.roles;
                if (Array.isArray(roleList)) return roleList.some((roleObj: any) => roleObj.name === 'ADMIN');
                return roleList?.name === 'ADMIN';
              });
              if (hasAdmin) role = 'ADMIN';
            }
          } catch (e) {
            // ignore
          }
          // fallback to server check if client anon read couldn't detect ADMIN
          if (role !== 'ADMIN' && typeof window !== 'undefined') {
            try {
              const res = await fetch('/api/user/role');
              if (res.ok) {
                const json = await res.json();
                if (json && json.role === 'ADMIN') role = 'ADMIN';
              }
            } catch (e) {
              // ignore
            }
          }
        }
        setSession({
          user: {
            id: user.id,
            email: user.email,
            name: user.user_metadata?.name || null,
            username: user.user_metadata?.username || null,
            image: user.user_metadata?.image || null,
            role,
          },
          accessToken: s.access_token,
        });
        setStatus('authenticated');
      } else {
        setSession(null);
        setStatus('unauthenticated');
      }
    });
    return () => {
      mounted = false;
      // Defensive unsubscribe
      try {
        listener?.subscription?.unsubscribe?.();
      } catch (e) {
        // ignore
      }
    };
  }, []);
  return { session, status };
}
