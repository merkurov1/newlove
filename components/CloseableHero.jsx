"use client";
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/components/AuthContext';
import useServerEffectiveRole from '@/hooks/useServerEffectiveRole';

// Lazy load the heavy visual hero (already a client component)
const HeroHearts = dynamic(() => import('@/components/HeroHearts'), { ssr: false });

const STORAGE_KEY = 'closeable_hero_closed_at_v1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function CloseableHero({ className = '' }) {
  const { session, isLoading } = useAuth();
  const serverRole = useServerEffectiveRole(session?.user ? session : null);

  const isAdmin = (serverRole === 'ADMIN') || (session?.user?.role === 'ADMIN');
  const isAuthed = !!session?.user;

  const [closed, setClosed] = useState(false);

  // Build a per-user storage key so closing the hero doesn't leak between users
  const storageKey = session?.user?.id ? `${STORAGE_KEY}:${session.user.id}` : STORAGE_KEY;

  useEffect(() => {
    try {
      // If there is no authenticated user, we don't persist a closed state for "anon"
      if (!session?.user) {
        setClosed(false);
        return;
      }

      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setClosed(false);
        return;
      }
      const ts = parseInt(raw, 10);
      if (Number.isFinite(ts) && Date.now() - ts < WEEK_MS) {
        setClosed(true);
      } else {
        setClosed(false);
      }
    } catch (e) {
      setClosed(false);
    }
  }, [session?.user?.id]);

  function doClose() {
    try {
      localStorage.setItem(storageKey, String(Date.now()));
    } catch (e) {}
    setClosed(true);
  }

  // Admins always see the hero regardless of close state
  if (isAdmin) {
    return (
      <div className={className}>
        <HeroHearts />
      </div>
    );
  }

  // Unauthenticated always see the hero
  if (!isAuthed) {
    return (
      <div className={className}>
        <HeroHearts />
      </div>
    );
  }

  // Authed non-admin: show hero unless closed within WEEK_MS
  if (closed) return null;

  return (
    <div className={`relative ${className}`}>
      <div className="absolute top-3 right-3 z-20">
        <button onClick={doClose} aria-label="Закрыть" className="text-gray-500 hover:text-gray-800 bg-white/60 rounded-full p-1">
          ✕
        </button>
      </div>
      <HeroHearts />
    </div>
  );
}
