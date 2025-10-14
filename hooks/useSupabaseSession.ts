"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) {
  throw new Error('Supabase URL or anon key is not defined in environment variables');
}
const supabase = createClient(supabaseUrl, anonKey);

export default function useSupabaseSession() {
  const [session, setSession] = useState<any | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    let mounted = true;
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
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
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
      sub.subscription.unsubscribe();
    };
  }, []);
  return { session, status };
}
