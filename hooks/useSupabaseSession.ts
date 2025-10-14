"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';

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
        // Always check user_roles for ADMIN
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
        const sessionLike = {
          user: {
            id: user.id,
            email: user.email,
            name: user.user_metadata?.name || null,
            username: user.user_metadata?.username || null,
            image: user.user_metadata?.image || null,
            role,
          },
          accessToken: s.access_token,
        };
        setSession(sessionLike);
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
        const sessionLike = {
          user: {
            id: user.id,
            email: user.email,
            name: user.user_metadata?.name || null,
            username: user.user_metadata?.username || null,
            image: user.user_metadata?.image || null,
            role,
          },
          accessToken: s.access_token,
        };
        setSession(sessionLike);
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
