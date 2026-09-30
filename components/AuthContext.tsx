// components/AuthContext.tsx

"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { User, Session } from '@supabase/supabase-js';

export interface AuthContextType {
  user: User | null;
  profile: any | null;
  session: Session | null;
  roles: string[];
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};

export function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchProfile = useCallback(async (userId: string) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    try {
      const { data } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
      setProfile(data);
    } catch (e) {
      console.error('Error fetching profile:', e);
    }
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (mounted) {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          if (currentSession?.user) {
            await fetchProfile(currentSession.user.id);
          }
        }
      } catch (e) {
        console.error('Error initializing auth session:', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (!mounted) return;
      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser.id);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signInWithGoogle = useCallback(async () => {
    const desiredRedirect = typeof window !== 'undefined' ? window.location.href : undefined;
    const canonical = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : undefined);
    if (typeof window !== 'undefined' && desiredRedirect) {
      try { localStorage.setItem('supabase_oauth_redirect', desiredRedirect); } catch (e) {}
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: canonical },
    });
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  }, [supabase]);

  const roles: string[] = useMemo(() => {
    if (!user) return [];
    const role = (user.user_metadata?.role || profile?.role) ?? 'USER';
    return [String(role).toUpperCase()];
  }, [user, profile]);

  const value = useMemo<AuthContextType>(() => ({
    user,
    profile,
    session,
    roles,
    isLoading,
    signInWithGoogle,
    signOut,
    refreshProfile: async () => {
      if (user?.id) await fetchProfile(user.id);
    },
  }), [user, profile, session, roles, isLoading, signInWithGoogle, signOut, fetchProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const AuthProvider = AuthProviderInner;
export default AuthContext;
