/* Combined Temple & Vigil sources
   Generated: 2025-11-23
   Files included:
   - app/temple/page.tsx
   - app/temple/TempleLogs.client.tsx
   - components/templeTrack.ts
   - lib/session.ts
   - app/vigil/page.tsx
   - app/api/temple/auth/route.ts
   - app/api/temple/me/route.ts
   - app/api/temple_logs/route.ts
   - app/api/vigil/claim/route.ts
*/


/* ===== FILE: app/temple/page.tsx ===== */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import TempleLogsClient from './TempleLogs.client';

export default function TemplePage() {
  const [isTelegram, setIsTelegram] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 1. Ручная загрузка скрипта (так надежнее всего)
    // Before loading Telegram script, check for an existing server-side session
    // so site users are recognised even without Telegram WebApp.
    (async function checkSession() {
      try {
        const res = await fetch('/api/temple/me', { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          if (json?.displayName) {
            try { localStorage.setItem('temple_user', json.displayName); } catch (e) {}
            setIsTelegram(true); // treat as an identified user for UI
          }
        }
      } catch (e) {}
    })();

    const script = document.createElement('script');
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;

    script.onload = () => {
      const interval = setInterval(() => {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
          clearInterval(interval);
          setIsTelegram(true);
          
          tg.ready();
          tg.expand();
          try { tg.BackButton.hide(); } catch (e) {}
          try { tg.setHeaderColor('#000000'); tg.setBackgroundColor('#000000'); } catch (e) {}

          // Тихая авторизация через наш API
          // Send full initData to server (safer: allows server to verify HMAC)
          const initData = (window as any).Telegram?.WebApp?.initData || null;
          const user = tg.initDataUnsafe?.user;
          if (user) {
            // Send auth to server; server sets an HTTP-only cookie.
            fetch('/api/temple/auth', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...user, initData })
            })
              .then(res => res.json())
              .then(json => {
                if (json?.displayName) {
                  try { localStorage.setItem('temple_user', json.displayName); } catch (e) {}
                  // If server returned token (dev fallback), persist for later requests
                  if (json?.token) {
                    try { localStorage.setItem('temple_session_token', json.token); } catch (e) {}
                  }
                  setIsTelegram(true);
                }
              })
              .catch(err => console.error("Auth sync failed", err));
          }
        }
      }, 100);
      // Stop checking after 5s
      setTimeout(() => clearInterval(interval), 5000);
    };
    
    document.head.appendChild(script);

    return () => { 
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, []);

  // Ensure Telegram auth: try localStorage first, otherwise post initData to server
  async function ensureTelegramAuth() {
    try {
      const existing = typeof window !== 'undefined' ? localStorage.getItem('temple_user') : null;
      if (existing) return true;
      const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
      if (!tg) return false;
      const initData = tg.initData || (window as any).Telegram?.WebApp?.initData || null;
      const user = tg.initDataUnsafe?.user || null;
      if (!user) return false;
      const res = await fetch('/api/temple/auth', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, initData })
      });
      if (!res.ok) return false;
      const json = await res.json().catch(() => ({}));
      if (json?.displayName) {
        if (json?.token) {
          try { localStorage.setItem('temple_session_token', json.token); } catch (e) {}
        }
        try { localStorage.setItem('temple_user', json.displayName); } catch (e) {}
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // Navigation helper: ensure Telegram auth before navigating when in WebApp
  const handleNav = async (href: string) => {
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
    if (tg) {
      // Try to authenticate first
      await ensureTelegramAuth();
      // small delay to allow cookie to be set
      await new Promise(r => setTimeout(r, 150));
    }
    router.push(href);
  }

  // Клик по кнопке пишет в лог (через серверный API, использующий service-role key)
  const trackClick = async (service: string) => {
    try {
      const displayName = typeof window !== 'undefined' ? (localStorage.getItem('temple_user') || 'Кто-то') : 'Кто-то';
      await fetch('/api/temple_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'nav', message: `${displayName} entered ${service}` })
      });
    } catch (e) {
      console.warn('trackClick failed', e);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col p-4 relative overflow-hidden">
      
      {/* ЯДЕРНЫЙ CSS: Скрываем хедеры сайта */}
      <style jsx global>{`
        header, footer, nav, .header, .footer, #header, #footer {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            pointer-events: none !important;
        }
        html, body {
            background-color: #000000 !important;
            overflow-x: hidden;
        }
      `}</style>

      <div className="mt-8 mb-8 text-center z-10">
        <h1 className="text-3xl font-bold tracking-[0.2em] mb-1 text-white">TEMPLE</h1>
        <div className="text-[10px] text-zinc-500 tracking-widest uppercase mb-4">
           DIGITAL SANCTUARY
        </div>
      </div>

      {/* МЕНЮ */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm z-10 mx-auto pb-10">
        <button onClick={async () => { await handleNav('/vigil?mode=temple'); trackClick('Vigil'); }} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform no-underline text-white">
          <div className="text-2xl">🕯</div>
          <div className="text-xs font-bold tracking-widest">VIGIL</div>
        </button>

        <button onClick={async () => { await handleNav('/heartandangel/letitgo?mode=temple'); trackClick('Let It Go'); }} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform no-underline text-white">
          <div className="text-2xl">❤️</div>
          <div className="text-xs font-bold tracking-widest">LET IT GO</div>
        </button>

        <button onClick={async () => { await handleNav('/absolution?mode=temple'); trackClick('Absolution'); }} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform no-underline text-white">
          <div className="text-2xl">🧾</div>
          <div className="text-xs font-bold tracking-widest">ABSOLVE</div>
        </button>

        <button onClick={async () => { await handleNav('/cast?mode=temple'); trackClick('Cast'); }} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform no-underline text-white">
          <div className="text-2xl">💀</div>
          <div className="text-xs font-bold tracking-widest">CAST</div>
        </button>
      </div>

      {/* ЖИВАЯ ЛЕТОПИСЬ (перенесено под кнопки) */}
      <div className="w-full max-w-md mt-8 mb-8 min-h-[100px] flex flex-col justify-end items-center gap-2 pointer-events-none z-0 opacity-70">
        <TempleLogsClient initialLogs={[]} />
      </div>
    </div>
  );
}


/* ===== FILE: app/temple/TempleLogs.client.tsx ===== */

"use client";

import React, { useEffect, useState } from 'react';

export interface TempleLog {
  id: string;
  event_type?: string;
  message?: string;
  created_at?: string;
  [key: string]: any;
}

export default function TempleLogsClient({ initialLogs = [], serverError = null }: { initialLogs?: TempleLog[]; serverError?: string | null }) {
  const [logs, setLogs] = useState<TempleLog[]>(initialLogs ?? []);
  const [loading, setLoading] = useState<boolean>(initialLogs?.length === 0 && !serverError);
  const [error, setError] = useState<string | null>(serverError ?? null);

  useEffect(() => {
    let mounted = true;

    const fetchLogs = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/temple_logs');
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!mounted) return;
        setLogs(json.data ?? []);
      } catch (ex: any) {
        if (!mounted) return;
        console.warn('client fetch temple_log error', ex);
        setError(String(ex.message || ex));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchLogs();

    // Use a longer polling interval when running inside the Telegram MiniApp
    // to avoid excessive log refreshes there. Default to 5s for web.
    const isTelegramWebApp = typeof window !== 'undefined' && (window as any).Telegram && (window as any).Telegram.WebApp
    // Mini-app: 30s; Web: 5 minutes to reduce frequent refreshes
    const intervalMs = isTelegramWebApp ? 30000 : 5 * 60 * 1000
    const iv = setInterval(fetchLogs, intervalMs);
    return () => { mounted = false; clearInterval(iv); };
  }, [initialLogs.length]);

  if (error) return <div className="p-4 text-red-400">Ошибка: {error}</div>;
  if (loading) return <div className="p-4 text-gray-400">Загрузка...</div>;
  if (!logs || logs.length === 0) return <div className="p-4 text-gray-500">...тишина...</div>;

  return (
    <div className="space-y-2 p-4">
      {logs.map((log) => (
        <div key={String(log.id)} className="flex items-start gap-3 p-2 bg-neutral-900 rounded">
          <div style={{ minWidth: 28, textAlign: 'center' }}>
            {log.event_type === 'vigil' ? '🕯️' :
             log.event_type === 'letitgo' ? '❤️‍🔥' :
             log.event_type === 'absolution' ? '🕊️' :
             log.event_type === 'cast' ? '📡' :
             log.event_type === 'enter' ? '👣' : '•'}
          </div>
          <div className="flex-1">
            <div className="text-sm text-gray-200">{log.message}</div>
            <div className="text-xs text-gray-500">{log.created_at ? new Date(log.created_at).toLocaleString() : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}


/* ===== FILE: components/templeTrack.ts ===== */

export async function templeTrack(eventType: string, message: string) {
  try {
    let displayName = typeof window !== 'undefined' ? (localStorage.getItem('temple_user') || null) : null;
    if (!displayName && typeof window !== 'undefined') {
      // Try server-side session as a fallback
      try {
        const res = await fetch('/api/temple/me');
        if (res.ok) {
          const j = await res.json();
          if (j?.displayName) {
            displayName = j.displayName;
            try { if (displayName) localStorage.setItem('temple_user', displayName); } catch (e) {}
          }
        }
      } catch (e) {
        // ignore
      }
    }

    const finalMessage = displayName ? `${displayName}: ${message}` : message;

    await fetch('/api/temple_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, message: finalMessage })
    })
  } catch (e) {
    // don't throw — logging must not break UX
    // eslint-disable-next-line no-console
    console.warn('templeTrack failed', e)
  }
}


/* ===== FILE: lib/session.ts ===== */

import * as jwt from 'jsonwebtoken'

const SECRET: jwt.Secret = process.env.NEXT_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev_secret_change_me'

export function signSession(payload: { userId: string; displayName: string }, expiresIn = '30d') {
  // Use a narrow any-cast to avoid TypeScript overload resolution issues
  return (jwt.sign as any)(payload, SECRET, { expiresIn })
}

export function verifySession(token: string) {
  try {
    return jwt.verify(token, SECRET) as { userId: string; displayName: string; iat?: number; exp?: number }
  } catch (e) {
    return null
  }
}


/* ===== FILE: app/vigil/page.tsx ===== */

"use client";

import * as React from "react";
import { useState, useEffect, useRef, useMemo, Suspense } from "react"; // Добавил Suspense
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthContext'; 
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import TempleWrapper from '@/components/TempleWrapper'; // Импортируем Wrapper
import { templeTrack } from '@/components/templeTrack';

// --- CONFIGURATION ---
const ADMIN_ID = 'fffa55a9-1ed7-49ff-953d-dfffa9f00844'; 

const HEARTS_DATA = [
  { id: 1, static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0964.jpeg', loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-7916633362072566540.mp4' },
  { id: 2, static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0962.jpeg', loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-6228877831163806687.mp4' },
  { id: 3, static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0957.jpeg', loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-8682541785678079730.mp4' },
  { id: 4, static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0960.jpeg', loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1607792915860564384.mp4' },
  { id: 5, static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0955.jpeg', loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-5300087847065473569.mp4' }
];

const ANGEL_IMAGE = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';

interface HeartData {
  id: number;
  owner_name: string | null;
  owner_id?: string | null;
  intention?: string | null;
  last_lit_at: string;
}

interface SparkParticle {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export default function VigilPage() {
  const [dbHearts, setDbHearts] = useState<HeartData[]>([]);
  const [showManifesto, setShowManifesto] = useState(false);
  const [selectedHeart, setSelectedHeart] = useState<number | null>(null);
  
  const [nameInput, setNameInput] = useState('');
  const [intentionInput, setIntentionInput] = useState('');

  const [sparkParticles, setSparkParticles] = useState<SparkParticle[]>([]);
  const [isLighting, setIsLighting] = useState(false);
  const [flash, setFlash] = useState(false); 
  const [showLogin, setShowLogin] = useState(false);
  const [debugMessage, setDebugMessage] = useState<string>('');

  const { user } = useAuth();
  const ModernLoginModal = dynamic(() => import('@/components/ModernLoginModal'), { ssr: false });
  
  const angelRef = useRef<HTMLDivElement | null>(null);
  const heartRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const supabase = createClient();

  useEffect(() => {
    fetchHearts();
    
    const channel = supabase
      .channel('vigil_hearts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, () => fetchHearts())
      .subscribe();

    if (!localStorage.getItem('vigil_visited')) {
      setShowManifesto(true);
      localStorage.setItem('vigil_visited', 'true');
    }

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    templeTrack('enter', 'User opened Vigil page')
  }, [])

  const fetchHearts = async () => {
    const { data } = await supabase.from('vigil_hearts').select('*');
    if (data) setDbHearts(data);
  };

  const activeHeartsCount = useMemo(() => {
    if (!dbHearts.length) return 0;
    const now = new Date().getTime();
    return dbHearts.filter(h => {
      if (!h.last_lit_at) return false;
      return (now - new Date(h.last_lit_at).getTime()) < (24 * 60 * 60 * 1000);
    }).length;
  }, [dbHearts]);

  const getHeartState = (heartId: number) => {
    const dbRecord = dbHearts.find(h => h.id === heartId);
    if (!dbRecord || !dbRecord.last_lit_at) {
      return { isAlive: false, owner: null, intention: null, isMine: false, filter: 'grayscale(100%) brightness(0.2)', glow: 'none', scale: 0.95 };
    }

    const now = new Date();
    const litTime = new Date(dbRecord.last_lit_at);
    const hoursPassed = (now.getTime() - litTime.getTime()) / (1000 * 60 * 60);
    const isAlive = hoursPassed < 24;
    const isMine = user ? dbRecord.owner_id === user.id : false;

    let filter = '', glow = '', scale = 1;

    if (isAlive) {
      if (hoursPassed < 6) {
        filter = 'brightness(1.3) saturate(1.4) contrast(1.1)';
        glow = '0 0 50px rgba(255, 60, 60, 0.8)';
        scale = 1.05;
      } else if (hoursPassed < 12) {
        filter = 'brightness(1) saturate(1)';
        glow = '0 0 25px rgba(255, 60, 60, 0.4)';
        scale = 1;
      } else {
        filter = 'grayscale(0.6) brightness(0.7)';
        glow = '0 0 10px rgba(255, 60, 60, 0.15)';
        scale = 0.98;
      }
    } else {
      filter = 'grayscale(100%) brightness(0.2)';
      glow = 'none';
      scale = 0.95;
    }

    return { isAlive, owner: isAlive ? dbRecord.owner_name : null, intention: isAlive ? dbRecord.intention : null, isMine, filter, glow, scale };
  };

  const handleHeartClick = (heartId: number) => {
    if (!user) {
      setShowLogin(true);
      return;
    }

    const state = getHeartState(heartId);

    if (state.isAlive && !state.isMine) {
        if (user.id === ADMIN_ID) {
            setSelectedHeart(heartId); 
            return;
        }
        setDebugMessage(`Occupied by ${state.owner}. Wait for the light to fade.`);
        setTimeout(() => setDebugMessage(''), 3000);
        return;
    }

    setSelectedHeart(heartId);
    if (state.isMine) {
        setNameInput(state.owner || '');
        setIntentionInput(state.intention || '');
    } else {
        setNameInput(user.email?.split('@')[0] || '');
        setIntentionInput('');
    }
  };

  const triggerRitual = async () => {
    // If there's no supabase user but we might have a temple session (Telegram miniapp),
    // we'll POST to server-side endpoint which will verify temple_session and upsert via service role.
    if (!selectedHeart || !nameInput.trim() || isLighting) return;
    
    setIsLighting(true);
    const heartIdToUpdate = selectedHeart;
    setSelectedHeart(null); 

    const angelRect = angelRef.current?.getBoundingClientRect();
    const targetRect = heartRefs.current[heartIdToUpdate]?.getBoundingClientRect();

    if (angelRect && targetRect) {
      const startX = angelRect.left + (angelRect.width * 0.85); 
      const startY = angelRect.top + (angelRect.height * 0.55); 
      const endX = targetRect.left + (targetRect.width / 2);
      const endY = targetRect.top + (targetRect.height / 2);

      const sparkId = `spark-${Date.now()}`;
      
      setSparkParticles(prev => [...prev, { id: sparkId, startX, startY, endX, endY }]);

        setTimeout(async () => {
        setFlash(true);
        if (navigator.vibrate) navigator.vibrate([50, 50]); 
        setTimeout(() => setFlash(false), 200);

        setSparkParticles(prev => prev.filter(s => s.id !== sparkId));

        try {
          if (user && user.id) {
            // Signed-in via Supabase: update directly from client
            await supabase.from('vigil_hearts').upsert({
              id: heartIdToUpdate,
              owner_name: nameInput.trim(),
              owner_id: user.id,
              intention: intentionInput.trim(),
              last_lit_at: new Date().toISOString()
            });
          } else {
            // Not signed in via Supabase: attempt server-side claim via temple_session
            // If cookie wasn't accepted (common in dev/WebView), include token fallback
            const token = typeof window !== 'undefined' ? localStorage.getItem('temple_session_token') : null;
            const body: any = { id: heartIdToUpdate, name: nameInput.trim(), intention: intentionInput.trim() };
            if (token) body.token = token;

            const res = await fetch('/api/vigil/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            const j = await res.json();
            if (!res.ok) {
              console.warn('vigil claim failed', j);
              setDebugMessage(j?.error || 'claim failed');
              setTimeout(() => setDebugMessage(''), 3000);
            }
          }
        } catch (e) {
          console.error('triggerRitual error', e);
        }

        setIsLighting(false);
      }, 2500); 
    } else {
      setIsLighting(false);
    }
  };

  const triggerExtinguish = async () => {
      if (!selectedHeart || !user || user.id !== ADMIN_ID) return;
      
      await supabase.from('vigil_hearts').upsert({
          id: selectedHeart,
          owner_name: null,
          owner_id: null,
          intention: null,
          last_lit_at: null 
      });
      setSelectedHeart(null);
  };

  return (
    <div className="vigil-container">
      {/* --- ВСТАВЛЯЕМ WRAPPER СЮДА --- */}
      <Suspense fallback={null}>
        <TempleWrapper />
      </Suspense>

      <div style={{display:'none'}}>
        {HEARTS_DATA.map(h => <video key={h.id} src={h.loop} preload="auto" />)}
      </div>

      <div style={{
          position: 'fixed', inset: 0, background: 'white', pointerEvents: 'none', zIndex: 9999,
          opacity: flash ? 0.15 : 0, transition: 'opacity 0.2s ease-out'
      }} />

      <AnimatePresence>
        {debugMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="debug-toast"
          >
            {debugMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <button className="info-button" onClick={() => setShowManifesto(true)}>?</button>

      <div className="room" style={{
          filter: `brightness(${0.4 + (activeHeartsCount * 0.12)})` 
      }}>
        
        <div className="angel-layer" ref={angelRef}>
          <img 
            src={ANGEL_IMAGE} 
            className="angel-img" 
            alt="Watcher"
            style={{
                filter: activeHeartsCount >= 3 
                    ? 'drop-shadow(0 0 40px rgba(255, 215, 0, 0.7)) brightness(1.2)' 
                    : 'drop-shadow(0 0 15px rgba(255, 255, 255, 0.2)) brightness(0.9)',
                transition: 'filter 2s ease'
            }} 
          />
        </div>

        <div className="shelves-grid">
          {HEARTS_DATA.map((asset) => {
            const state = getHeartState(asset.id);
            return (
              <div 
                key={asset.id}
                ref={(el: HTMLDivElement | null) => { heartRefs.current[asset.id] = el }}
                className="heart-slot"
                onClick={() => handleHeartClick(asset.id)}
                style={{ 
                  transform: `scale(${state.scale})`,
                  cursor: (state.isAlive && !state.isMine && user?.id !== ADMIN_ID) ? 'not-allowed' : 'pointer'
                }}
              >
                <div className="heart-inner" style={{ filter: state.filter, boxShadow: state.glow, border: state.isMine ? '1px solid rgba(255,255,255,0.3)' : 'none' }}>
                  {state.isAlive ? (
                    <video src={asset.loop} autoPlay loop muted playsInline className="heart-content" />
                  ) : (
                    <img src={asset.static} className="heart-content" alt="Empty" />
                  )}
                </div>
                
                <div className="heart-meta">
                  <div className="heart-owner">{state.isAlive ? state.owner : "VACANT"}</div>
                  {state.isAlive && state.intention && (
                    <div className="heart-intention">for {state.intention}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="spark-layer">
        <AnimatePresence>
          {sparkParticles.map(spark => (
            <motion.div
              key={spark.id}
              className="spark"
              initial={{ x: spark.startX, y: spark.startY, opacity: 0, scale: 0.2 }}
              animate={{ 
                x: spark.endX, 
                y: spark.endY, 
                opacity: [0, 1, 1, 0.8], 
                scale: [0.2, 1.5, 0.5] 
              }}
              transition={{ 
                duration: 2.5, 
                ease: "easeInOut",
                times: [0, 0.2, 0.9, 1]
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      {selectedHeart !== null && (
        <div className="modal-backdrop" onClick={() => setSelectedHeart(null)}>
          <div className="modal-box" onClick={(e) => (e as React.MouseEvent<HTMLDivElement>).stopPropagation()}>
            
            {user?.id === ADMIN_ID && getHeartState(selectedHeart).isAlive && !getHeartState(selectedHeart).isMine ? (
                <>
                    <h3>ADMIN CONTROL</h3>
                    <p className="text-sm text-gray-400 mb-4">Owned by: {getHeartState(selectedHeart).owner}</p>
                    <button onClick={triggerExtinguish} className="btn-danger">EXTINGUISH FLAME</button>
                </>
            ) : (
                <>
                    <h3>{getHeartState(selectedHeart).isMine ? "REIGNITE" : "CLAIM VESSEL"}</h3>
                    
                    <div className="input-group">
                        <label>YOUR NAME</label>
                        <input 
                            autoFocus type="text" placeholder="Name" 
                            value={nameInput} onChange={(e) => setNameInput((e.target as HTMLInputElement).value)}
                        />
                    </div>
                    
                    <div className="input-group">
                        <label>YOUR INTENTION (OPTIONAL)</label>
                        <input 
                            type="text" placeholder="e.g. Silence, Bitcoin, Love" 
                            value={intentionInput} onChange={(e) => setIntentionInput((e.target as HTMLInputElement).value)}
                            onKeyDown={(e) => (e as React.KeyboardEvent<HTMLInputElement>).key === 'Enter' && !isLighting && triggerRitual()}
                        />
                    </div>

                    <button 
                        onClick={triggerRitual} 
                        disabled={isLighting || !nameInput.trim()}
                        className="btn-primary"
                    >
                        {isLighting ? 'TRANSFERRING SPARK...' : 'TRANSFER SPARK'}
                    </button>
                </>
            )}
          </div>
        </div>
      )}

      {showLogin && <ModernLoginModal onClose={() => setShowLogin(false)} />}

      {showManifesto && (
        <div className="modal-backdrop" onClick={() => setShowManifesto(false)}>
          <div className="modal-box manifesto" onClick={(e) => (e as React.MouseEvent<HTMLDivElement>).stopPropagation()}>
            <h2>THE VIGIL</h2>
            <p>The Internet is a cold void.<br/>Matter is dead until you touch it.</p>
            <p>These hearts are vessels.<br/>Click to transfer a spark of attention.<br/><b>State your Intention.</b></p>
            <p>Keep them warm, or they will turn to stone in 24 hours.</p>
            <p><i>We keep each other warm in the dark.</i></p>
            <button onClick={() => setShowManifesto(false)}>ENTER</button>
          </div>
        </div>
      )}

      <style jsx global>{`
        body { margin: 0; background: #020202; color: #eee; overflow: hidden; font-family: 'Inter', sans-serif; }
        
        .vigil-container {
          width: 100vw; height: 100vh;
          background: radial-gradient(circle at 50% 90%, #151515 0%, #000000 85%);
          perspective: 1200px;
          display: flex; justify-content: center; align-items: center;
          position: relative; /* Важно для позиционирования враппера */
        }

        .spark-layer { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 9999; }
        
        .spark {
          position: absolute; width: 8px; height: 8px; background: #fff; border-radius: 50%;
          box-shadow: 0 0 15px 4px rgba(255, 200, 50, 0.9), 0 0 40px 10px rgba(255, 100, 0, 0.4);
        }

        .info-button {
          position: absolute; top: 30px; right: 30px; width: 40px; height: 40px; border-radius: 50%;
          border: 1px solid #333; color: #666; background: transparent;
          font-family: serif; font-style: italic; font-size: 20px; cursor: pointer; z-index: 100;
        }
        .info-button:hover { border-color: #fff; color: #fff; }

        .room {
          width: 100%; max-width: 1400px; height: 85vh;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          transform-style: preserve-3d; transition: filter 1s ease;
        }

        .angel-layer {
          position: relative; z-index: 20; margin-bottom: 50px;
          animation: float 8s ease-in-out infinite;
        }
        .angel-img { width: 200px; opacity: 0.95; display: block; }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-20px); } }

        .shelves-grid {
          display: grid; grid-template-columns: repeat(5, 1fr); gap: 30px;
          width: 100%; padding: 0 20px; z-index: 10;
        }
        @media (max-width: 768px) {
          .shelves-grid { grid-template-columns: repeat(2, 1fr); gap: 15px; overflow-y: auto; max-height: 55vh; padding-bottom: 100px; }
          .angel-img { width: 140px; margin-bottom: 20px; }
        }

        .heart-slot {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .heart-slot:hover { transform: translateY(-5px) scale(1.03); }

        .heart-inner {
          width: 130px; height: 130px; border-radius: 50%; overflow: hidden; background: #000;
          transition: all 1.5s ease; position: relative;
        }
        .heart-content { width: 100%; height: 100%; object-fit: cover; }

        .heart-meta { text-align: center; min-height: 40px; display: flex; flex-direction: column; align-items: center; }
        .heart-owner { font-family: 'Space Mono', monospace; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        .heart-intention { font-family: serif; font-style: italic; font-size: 13px; color: #aaa; margin-top: 4px; opacity: 0.8; }

        .modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.9); backdrop-filter: blur(10px); z-index: 500;
          display: flex; justify-content: center; align-items: center;
        }
        .modal-box {
          background: #0a0a0a; border: 1px solid #333; padding: 40px; text-align: center; width: 90%; max-width: 400px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.9);
        }
        .modal-box h2, h3 { font-family: serif; font-weight: normal; letter-spacing: 2px; margin-bottom: 30px; }
        
        .input-group { margin-bottom: 20px; text-align: left; }
        .input-group label { display: block; font-size: 10px; color: #555; margin-bottom: 8px; font-family: monospace; text-transform: uppercase; }
        
        input {
          background: #111; border: 1px solid #333; color: white; padding: 12px; width: 100%;
          font-family: monospace; text-align: center; font-size: 16px; outline: none;
        }
        input:focus { border-color: #666; }

        button {
          background: white; color: black; border: none; padding: 12px 30px; font-family: monospace;
          cursor: pointer; font-weight: bold; letter-spacing: 1px; margin-top: 10px; width: 100%;
        }
        button:hover { opacity: 0.9; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-danger { background: #500; color: #faa; }
        
        .debug-toast {
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(50,0,0,0.9); border: 1px solid red; color: #ffaaaa;
            padding: 10px 20px; border-radius: 4px; z-index: 10000; font-family: monospace;
        }
      `}</style>
    </div>
  );
}


/* ===== FILE: app/api/temple/auth/route.ts ===== */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { signSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

function parseQuery(str: string) {
  return str.split('&').reduce<Record<string,string>>((acc, pair) => {
    const [k, v] = pair.split('=')
    if (!k) return acc
    acc[decodeURIComponent(k)] = decodeURIComponent(v || '')
    return acc
  }, {})
}

function buildDataCheckString(obj: Record<string,string>) {
  return Object.keys(obj).sort().map(k => `${k}=${obj[k]}`).join('\n')
}

function verifyTelegramInitData(initData: string, botToken: string) {
  try {
    const params = parseQuery(initData)
    const providedHash = params['hash']
    if (!providedHash) return false
    delete params['hash']
    const dataCheckString = buildDataCheckString(params)
    const secret = crypto.createHash('sha256').update(botToken).digest()
    const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
    return hmac === providedHash
  } catch (e) {
    return false
  }
}

export async function POST(req: Request) {
  console.log('API: /api/temple/auth hit')

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const botToken = process.env.TEMPLE_BOT_TOKEN

  if (!sbUrl || !sbServiceKey) {
    console.error('API Error: Missing Supabase Env Vars')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const supabaseAdmin = createClient(sbUrl, sbServiceKey, { auth: { persistSession: false } })

  try {
    const body = await req.json()
    console.log('API: Received body:', body)

    // If Telegram initData provided, verify it
    if (body?.initData) {
      if (!botToken) {
        console.error('Temple bot token missing (TEMPLE_BOT_TOKEN)')
        return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
      }
      const ok = verifyTelegramInitData(body.initData, botToken)
      if (!ok) {
        console.warn('Telegram initData verification failed')
        return NextResponse.json({ error: 'invalid telegram initData' }, { status: 401 })
      }
    }

    const id = String(body?.id || body?.user?.id || '')
    const username = body?.username || body?.user?.username || body?.user?.first_name || ''
    const first_name = body?.first_name || body?.user?.first_name || ''

    if (!id) {
      console.error('API: No ID in body')
      return NextResponse.json({ error: 'No ID provided' }, { status: 400 })
    }

    // Upsert в таблицу temple_users
    const { data, error } = await supabaseAdmin
      .from('temple_users')
      .upsert({
        telegram_id: id,
        username: username || '',
        first_name: first_name || '',
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'telegram_id' })
      .select()

    if (error) {
      console.error('API: Supabase Insert Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Prepare a display name (prefer username, then first_name)
    const displayName = username || first_name || `user_${String(id).slice(-6)}`

    // Логируем в temple_log только имя пользователя (без telegram id)
    await supabaseAdmin.from('temple_log').insert({ event_type: 'enter', message: `${displayName} entered` })

    // Create signed JWT session
    const token = signSession({ userId: id, displayName })
    const maxAge = 60 * 60 * 24 * 30 // 30 days
    const isProd = process.env.NODE_ENV === 'production'
    // If initData provided (Telegram flow), set SameSite=None to allow WebView cookies.
    const sameSite = body?.initData ? 'None' : 'Lax'
    const cookie = `temple_session=${token}; Path=/; Max-Age=${maxAge}; SameSite=${sameSite}; HttpOnly${isProd ? '; Secure' : ''}`

    // If we're in development (or not in a secure context), some WebViews/browsers
    // will ignore Set-Cookie when SameSite=None but Secure is not set. To make
    // local debugging possible, return the JWT token in the JSON body when not
    // running in production. The client will store it and send it to server-side
    // endpoints as a fallback.
    const resBody: any = { success: true, userId: id, displayName }
    if (!isProd) resBody.token = token

    return NextResponse.json(resBody, { status: 200, headers: { 'Set-Cookie': cookie } })
  } catch (e: any) {
    console.error('API: Critical Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}


/* ===== FILE: app/api/temple/me/route.ts ===== */

import { NextResponse } from 'next/server'

// This route reads request headers (cookies) and must be dynamic.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get('cookie') || ''
    const match = cookie.match(/(?:^|; )temple_user=([^;]+)/)
    if (!match) return NextResponse.json({ displayName: null })

    const displayName = decodeURIComponent(match[1])
    return NextResponse.json({ displayName })
  } catch (e: any) {
    console.error('GET /api/temple/me unexpected', e)
    return NextResponse.json({ displayName: null }, { status: 500 })
  }
}


/* ===== FILE: app/api/temple_logs/route.ts ===== */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth')
    const srv = getServerSupabaseClient({ useServiceRole: true })

    const { data, error } = await srv
      .from('temple_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      console.error('API GET /api/temple_logs error', error)
      return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (e: any) {
    console.error('API GET /api/temple_logs unexpected', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body?.message) return NextResponse.json({ error: 'message required' }, { status: 400 })

    const { getServerSupabaseClient } = await import('@/lib/serverAuth')
    const srv = getServerSupabaseClient({ useServiceRole: true })

    const { data, error } = await srv.from('temple_log').insert({
      event_type: body.event_type || 'nav',
      message: body.message,
      created_at: new Date().toISOString(),
    }).select().single()

    if (error) {
      console.error('API POST /api/temple_logs error', error)
      return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (e: any) {
    console.error('API POST /api/temple_logs unexpected', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}


/* ===== FILE: app/api/vigil/claim/route.ts ===== */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!sbUrl || !sbKey) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })

    const supabase = createClient(sbUrl, sbKey)

    const body = await req.json().catch(() => ({}))
    const { id, name, intention } = body || {}
    if (!id || !name) return NextResponse.json({ error: 'missing params' }, { status: 400 })

    // Verify temple session cookie or fallback token (for WebView/dev cases)
    let token: string | null = null
    const cookie = req.headers.get('cookie') || ''
    const m = cookie.match(/(?:^|; )temple_session=([^;]+)/)
    if (m) {
      token = decodeURIComponent(m[1])
    } else if (body && body.token) {
      token = String(body.token)
    } else {
      // Also accept Authorization: Bearer <token>
      const auth = req.headers.get('authorization') || ''
      const b = auth.match(/Bearer (.+)/)
      if (b) token = b[1]
    }

    if (!token) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
    const session = verifySession(token as string)
    if (!session || !session.userId) return NextResponse.json({ error: 'invalid session' }, { status: 401 })

    const ownerTelegramId = session.userId
    const ownerName = session.displayName || name

    const up = {
      id: Number(id),
      owner_name: ownerName,
      owner_id: `telegram:${ownerTelegramId}`,
      intention: intention || null,
      last_lit_at: new Date().toISOString()
    }

    const { data, error } = await supabase.from('vigil_hearts').upsert(up, { onConflict: 'id' }).select().single()
    if (error) {
      console.error('vigil claim error', error)
      return NextResponse.json({ error: 'db error' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, record: data })
  } catch (e: any) {
    console.error('vigil claim unexpected', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
