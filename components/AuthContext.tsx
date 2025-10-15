"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

const supabase = createBrowserClient();

type AuthState = {
  user: any | null;
  roles: string[];
  session: any | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [session, setSession] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setIsLoading(true);
      try {
        // Try session from supabase client
        const { data } = await supabase.auth.getSession();
        const sess = (data as any)?.session || null;
        if (sess && sess.user) {
          setUser(sess.user);
          setSession(sess);
          await loadRoles(sess.user.id, sess.access_token);
        } else {
          setUser(null);
          setRoles([]);
        }
      } catch (e) {
        console.error('AuthProvider init error', e);
      }
      if (mounted) setIsLoading(false);
    };
    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, payload) => {
      try {
        const sess = (payload as any)?.session || null;
        if (sess && sess.user) {
          setUser(sess.user);
          setSession(sess);
          await loadRoles(sess.user.id, sess.access_token);
        } else {
          setUser(null);
          setRoles([]);
          setSession(null);
        }
      } catch (e) {
        console.error('onAuthStateChange error', e);
      }
    });

    return () => {
      mounted = false;
      try { listener?.subscription?.unsubscribe?.(); } catch (e) {}
    };
  }, []);

  async function loadRoles(userId: string, accessToken?: string | null) {
    try {
      const headers: any = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const res = await fetch('/api/user/role', { headers });
      if (res.ok) {
        const json = await res.json();
        if (json && json.role) {
          setRoles([String(json.role).toUpperCase()]);
          return;
        }
      }
      // fallback: try anon user_roles read
      const { data: rolesData } = await supabase.from('user_roles').select('role_id,roles(name)').eq('user_id', userId);
      if (Array.isArray(rolesData)) {
        const found = rolesData.flatMap((r: any) => {
          const roleList = r.roles;
          if (Array.isArray(roleList)) return roleList.map((x: any) => String(x.name).toUpperCase());
          if (roleList) return [String(roleList.name).toUpperCase()];
          return [];
        });
        setRoles(found);
      }
    } catch (e) {
      console.error('loadRoles failed', e);
    }
  }

  async function signInWithGoogle() {
    // redirect back to current URL
    const redirectTo = typeof window !== 'undefined' ? window.location.href : undefined;
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } } as any);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setRoles([]);
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ user, roles, session, isLoading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
