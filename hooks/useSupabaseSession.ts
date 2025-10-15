"use client";
import { useEffect, useState } from 'react';

import { supabase, createClient as createBrowserClient } from '@/lib/supabase-browser';

// Use a single browser client factory so all components share the same
// auth state and subscriptions. Other components already import and call
// `createBrowserClient()` from `lib/supabase-browser.js`.


export default function useSupabaseSession() {
  const [session, setSession] = useState<any | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
  let mounted = true;
    const get = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const s = data.session;
        console.debug('[useSupabaseSession] getSession ->', { session: !!s, userId: s?.user?.id });
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
    } catch (e: any) {
      console.error('[useSupabaseSession] getSession error', e);
      if (mounted) setError(String(e));
      return;
    }
    };
    get();
  const { data: listener } = supabase.auth.onAuthStateChange(async (event, s) => {
      console.debug('[useSupabaseSession] onAuthStateChange', { event, userId: s?.user?.id });
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
        console.debug('[useSupabaseSession] signed out');
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
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    return error;
  };
  const signOut = async () => {
    await supabase.auth.signOut();
  };
  return { session, status, signIn, signOut, error };
}
