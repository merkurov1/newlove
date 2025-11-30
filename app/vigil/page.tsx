"use client";

import * as React from "react";
import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthContext'; 
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import TempleWrapper from '@/components/TempleWrapper';
import { templeTrack } from '@/components/templeTrack';
// Импортируем твои компоненты иконок
import { XIcon, InfoIcon, SparklesIcon } from '@/components/icons'; 

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
  
  const [templeToken, setTempleToken] = useState<string | null>(null);
  const [templeUserName, setTempleUserName] = useState<string | null>(null);

  const { user } = useAuth();
  const ModernLoginModal = dynamic(() => import('@/components/ModernLoginModal'), { ssr: false });
  
  const angelRef = useRef<HTMLDivElement | null>(null);
  const heartRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const supabase = createClient();

  // --- HAPTICS ---
  const triggerHaptic = (style: 'light' | 'medium' | 'heavy' | 'error') => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
        if (style === 'error') tg.HapticFeedback.notificationOccurred('error');
        else tg.HapticFeedback.impactOccurred(style);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('temple_session_token');
      const storedUser = localStorage.getItem('temple_user');
      if (storedToken) setTempleToken(storedToken);
      if (storedUser) setTempleUserName(storedUser);
    }

    // Telegram Init
    const initTelegram = () => {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
            tg.ready();
            tg.expand();
            tg.setHeaderColor('#000000');
            tg.setBackgroundColor('#000000');
            document.documentElement.style.setProperty('--tg-theme-bg-color', '#000000');
            
            const initData = tg.initData;
            const tgUser = tg.initDataUnsafe?.user;
            
            if (tgUser && !localStorage.getItem('temple_session_token')) {
                fetch('/api/temple/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...tgUser, initData })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.token) {
                        localStorage.setItem('temple_session_token', data.token);
                        setTempleToken(data.token);
                    }
                    if (data.displayName) {
                        localStorage.setItem('temple_user', data.displayName);
                        setTempleUserName(data.displayName);
                    }
                })
                .catch(console.error);
            }
        }
    };

    if ((window as any).Telegram?.WebApp) {
        initTelegram();
    } else {
        const script = document.createElement('script');
        script.src = "https://telegram.org/js/telegram-web-app.js";
        script.onload = initTelegram;
        document.head.appendChild(script);
    }

    fetchHearts();
    const channel = supabase
      .channel('vigil_hearts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, () => fetchHearts())
      .subscribe();

    if (!localStorage.getItem('vigil_visited')) {
      setShowManifesto(true);
      localStorage.setItem('vigil_visited', 'true');
    }

    templeTrack('enter', 'User opened Vigil page');
    return () => { supabase.removeChannel(channel); };
  }, []);

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

  const atmosphere = useMemo(() => {
    const intensity = Math.min(activeHeartsCount * 0.2, 1); 
    return {
        overlayOpacity: intensity * 0.4,
        angelOpacity: 0.3 + (intensity * 0.7),
    };
  }, [activeHeartsCount]);

  const getHeartState = (heartId: number) => {
    const dbRecord = dbHearts.find(h => h.id === heartId);
    if (!dbRecord || !dbRecord.last_lit_at) {
      return { isAlive: false, owner: null, intention: null, isMine: false };
    }
    const now = new Date();
    const litTime = new Date(dbRecord.last_lit_at);
    const hoursPassed = (now.getTime() - litTime.getTime()) / (1000 * 60 * 60);
    const isAlive = hoursPassed < 24;
    
    let isMine = false;
    if (user && dbRecord.owner_id === user.id) isMine = true;
    else if (templeUserName && dbRecord.owner_name === templeUserName) isMine = true;

    return { isAlive, owner: isAlive ? dbRecord.owner_name : null, intention: isAlive ? dbRecord.intention : null, isMine };
  };

  const handleHeartClick = (heartId: number) => {
    if (!user && !templeToken && !templeUserName) {
      setShowLogin(true);
      return;
    }
    triggerHaptic('light');
    const state = getHeartState(heartId);

    if (state.isAlive && !state.isMine) {
        if (user?.id === ADMIN_ID) {
            setSelectedHeart(heartId); 
            return;
        }
        triggerHaptic('error');
        setDebugMessage(`THIS FLAME BELONGS TO ${state.owner}`);
        setTimeout(() => setDebugMessage(''), 2000);
        return;
    }

    setSelectedHeart(heartId);
    if (state.isMine) {
        setNameInput(state.owner || '');
        setIntentionInput(state.intention || '');
    } else {
        const prefill = user?.email?.split('@')[0] || templeUserName || '';
        setNameInput(prefill);
        setIntentionInput('');
    }
  };

  const triggerRitual = async () => {
    if (!selectedHeart || !nameInput.trim() || isLighting) return;
    
    setIsLighting(true);
    triggerHaptic('medium');
    
    const heartIdToUpdate = selectedHeart;
    const angelRect = angelRef.current?.getBoundingClientRect();
    const targetRect = heartRefs.current[heartIdToUpdate]?.getBoundingClientRect();

    if (angelRect && targetRect) {
      const startX = window.innerWidth / 2; 
      const startY = window.innerHeight * 0.2; // From Angel's heart
      const endX = targetRect.left + (targetRect.width / 2);
      const endY = targetRect.top + (targetRect.height / 2);

      const sparkId = `spark-${Date.now()}`;
      setSparkParticles(prev => [...prev, { id: sparkId, startX, startY, endX, endY }]);
      
      setSelectedHeart(null); // Close modal

      setTimeout(async () => {
        setFlash(true);
        triggerHaptic('heavy');
        setTimeout(() => setFlash(false), 500);

        setSparkParticles(prev => prev.filter(s => s.id !== sparkId));

        try {
          if (user && user.id) {
            await supabase.from('vigil_hearts').update({owner_id: null, owner_name: null, last_lit_at: null}).eq('owner_id', user.id).neq('id', heartIdToUpdate);
            await supabase.from('vigil_hearts').upsert({
              id: heartIdToUpdate,
              owner_name: nameInput.trim(),
              owner_id: user.id,
              intention: intentionInput.trim(),
              last_lit_at: new Date().toISOString()
            });
          } else {
            const token = templeToken || (typeof window !== 'undefined' ? localStorage.getItem('temple_session_token') : null);
            const body: any = { id: heartIdToUpdate, name: nameInput.trim(), intention: intentionInput.trim() };
            if (token) body.token = token;

            const res = await fetch('/api/vigil/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            if (!res.ok && res.status === 401) setShowLogin(true);
          }
        } catch (e) {
          console.error(e);
        }
        setIsLighting(false);
      }, 1500);
    } else {
      setIsLighting(false);
      setSelectedHeart(null);
    }
  };

  return (
    <div className="vigil-root h-[100dvh] w-full overflow-hidden bg-black selection:bg-white/20">
      <Suspense fallback={null}><TempleWrapper /></Suspense>

      {/* Preload Videos */}
      <div style={{display:'none'}}>
        {HEARTS_DATA.map(h => <video key={h.id} src={h.loop} preload="auto" />)}
      </div>

      {/* --- LAYER 1: AMBIENT --- */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900/40 via-black to-black z-0 pointer-events-none" />
      
      {/* Dynamic Warmth Layer */}
      <div 
        className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-[3000ms] mix-blend-screen"
        style={{
            background: 'radial-gradient(circle at 50% 30%, rgba(255,100,50,0.15) 0%, rgba(0,0,0,0) 70%)',
            opacity: atmosphere.overlayOpacity
        }}
      />

      {/* Noise */}
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.04] mix-blend-overlay" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
      />

      {/* Flash Effect */}
      <div className="fixed inset-0 bg-white z-[9999] pointer-events-none transition-opacity duration-300 ease-out"
           style={{ opacity: flash ? 0.25 : 0 }} />


      {/* --- LAYER 2: UI CONTROLS --- */}
      <div className="fixed top-6 right-6 z-50">
        <button 
            onClick={() => setShowManifesto(true)} 
            className="w-10 h-10 rounded-full border border-white/10 bg-white/5 backdrop-blur-md flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all active:scale-95"
        >
            <InfoIcon className="w-5 h-5 opacity-70" />
        </button>
      </div>

      {/* Toast Messages */}
      <AnimatePresence>
        {debugMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 bg-red-950/90 border border-red-500/30 text-red-200 px-6 py-3 text-[10px] font-mono tracking-[0.2em] z-[100] backdrop-blur-xl rounded-sm shadow-[0_0_20px_rgba(255,0,0,0.1)]"
          >
            {debugMessage}
          </motion.div>
        )}
      </AnimatePresence>


      {/* --- LAYER 3: THE ALTAR (Main Content) --- */}
      <div className="relative w-full h-full flex flex-col items-center justify-center z-10">
        
        {/* THE ANGEL (Background Spirit) */}
        <div ref={angelRef} className="absolute top-[15%] pointer-events-none transition-all duration-[2000ms] mix-blend-lighten"
             style={{ 
                 opacity: atmosphere.angelOpacity,
                 filter: `blur(${activeHeartsCount === 0 ? '8px' : '0px'}) grayscale(100%) contrast(120%)` 
             }}>
          <img src={ANGEL_IMAGE} className="w-[280px] opacity-80 animate-float" alt="Angel" />
        </div>

        {/* THE HEARTS GRID (2-1-2 Formation) */}
        {/* We use a flex column with rows to ensure perfect centering regardless of screen size */}
        <div className="relative mt-[10vh] flex flex-col items-center gap-10 md:gap-12">
            
            {/* ROW 1: Top Hearts */}
            <div className="flex gap-16 md:gap-24">
                {[HEARTS_DATA[0], HEARTS_DATA[1]].map((asset, i) => (
                    <VigilHeart key={asset.id} asset={asset} state={getHeartState(asset.id)} onClick={handleHeartClick} heartRef={heartRefs} />
                ))}
            </div>

            {/* ROW 2: Center Heart (Keystone) */}
            <div className="-mt-4 md:-mt-6 z-20">
                 <VigilHeart key={HEARTS_DATA[2].id} asset={HEARTS_DATA[2]} state={getHeartState(HEARTS_DATA[2].id)} onClick={handleHeartClick} heartRef={heartRefs} isCenter />
            </div>

            {/* ROW 3: Bottom Hearts */}
            <div className="flex gap-16 md:gap-24 -mt-4 md:-mt-6">
                {[HEARTS_DATA[3], HEARTS_DATA[4]].map((asset, i) => (
                    <VigilHeart key={asset.id} asset={asset} state={getHeartState(asset.id)} onClick={handleHeartClick} heartRef={heartRefs} />
                ))}
            </div>

        </div>
      </div>


      {/* --- LAYER 4: PARTICLES --- */}
      <AnimatePresence>
        {sparkParticles.map(spark => (
            <motion.div
                key={spark.id}
                className="fixed w-1.5 h-1.5 bg-white rounded-full z-[9999] shadow-[0_0_25px_white]"
                initial={{ x: spark.startX, y: spark.startY, opacity: 0, scale: 0.5 }}
                animate={{ x: spark.endX, y: spark.endY, opacity: 1, scale: 1.5 }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
            />
        ))}
      </AnimatePresence>


      {/* --- LAYER 5: INTERACTION (Bottom Sheet) --- */}
      <AnimatePresence>
        {selectedHeart !== null && (
            <>
                {/* Backdrop */}
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
                    onClick={() => !isLighting && setSelectedHeart(null)}
                />
                
                {/* Sheet */}
                <motion.div 
                    initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="fixed bottom-0 left-0 right-0 z-[100] flex justify-center pb-6 px-4"
                >
                    <div className="w-full max-w-md bg-[#090909] border border-white/10 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/5">
                        
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                            <span className="text-[10px] font-mono tracking-[0.2em] text-white/40 uppercase">
                                Heart Protocol
                            </span>
                            <button onClick={() => setSelectedHeart(null)} className="text-white/40 hover:text-white">
                                <XIcon className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 flex flex-col gap-5">
                            
                            <div className="text-center space-y-1">
                                <h3 className="text-lg font-serif text-white tracking-wide">
                                    {getHeartState(selectedHeart).isMine ? "Keep the Fire" : "Ignite the Void"}
                                </h3>
                                <p className="text-xs text-white/30 font-mono">
                                    Slot #{selectedHeart} selected
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="group">
                                    <input 
                                        autoFocus
                                        type="text" 
                                        className="w-full bg-transparent border-b border-white/10 py-3 text-center text-xl text-white font-serif placeholder:text-white/10 focus:outline-none focus:border-white/50 transition-colors uppercase tracking-widest"
                                        placeholder="YOUR NAME"
                                        maxLength={15}
                                        value={nameInput}
                                        onChange={(e) => setNameInput(e.target.value.toUpperCase())}
                                    />
                                </div>
                                <div className="group">
                                    <input 
                                        type="text" 
                                        className="w-full bg-transparent border-b border-white/10 py-3 text-center text-sm text-white/70 font-serif italic placeholder:text-white/10 focus:outline-none focus:border-white/50 transition-colors"
                                        placeholder="what is your intention?"
                                        maxLength={30}
                                        value={intentionInput}
                                        onChange={(e) => setIntentionInput(e.target.value)}
                                    />
                                </div>
                            </div>

                            <button 
                                disabled={isLighting || !nameInput.trim()}
                                onClick={triggerRitual}
                                className="mt-2 w-full bg-white text-black h-12 rounded-sm font-mono text-[11px] tracking-[0.2em] hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] uppercase flex items-center justify-center gap-2"
                            >
                                {isLighting ? <SparklesIcon className="w-4 h-4 animate-spin" /> : null}
                                {isLighting ? "TRANSMITTING..." : "LIGHT FLAME"}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </>
        )}
      </AnimatePresence>

      {/* MANIFESTO */}
      <AnimatePresence>
        {showManifesto && (
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex items-center justify-center p-6"
                onClick={() => setShowManifesto(false)}
            >
                <div className="max-w-sm w-full border border-white/10 bg-black p-8 relative shadow-[0_0_50px_rgba(255,255,255,0.05)]">
                    <h2 className="text-xl font-serif text-white mb-6 text-center tracking-wide border-b border-white/10 pb-4">The Vigil</h2>
                    <div className="space-y-4 text-xs font-mono text-white/60 leading-relaxed text-justify">
                        <p>You have entered the Temple of Digital Silence.</p>
                        <ul className="space-y-2 border-l border-white/20 ml-2 pl-4">
                            <li><span className="text-white">5 Vessels.</span> Only 5 flames can burn at once.</li>
                            <li><span className="text-white">1 Flame.</span> You may hold only one.</li>
                            <li><span className="text-white">Entropy.</span> Lighting a new flame extinguishes your old one.</li>
                            <li><span className="text-white">Time.</span> The fire dies after 24 hours.</li>
                        </ul>
                        <p className="pt-4 text-center italic text-white/40 font-serif">
                            "We keep each other warm in the dark."
                        </p>
                    </div>
                    <button onClick={() => setShowManifesto(false)} className="w-full mt-8 border border-white/20 py-3 text-[10px] tracking-[0.3em] text-white hover:bg-white hover:text-black transition-colors uppercase">
                        Enter
                    </button>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {showLogin && <ModernLoginModal onClose={() => setShowLogin(false)} />}

      <style jsx global>{`
        @keyframes float { 
            0%, 100% { transform: translateY(0px); } 
            50% { transform: translateY(-10px); } 
        }
        .animate-float { animation: float 8s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

// --- SUB-COMPONENT: VIGIL HEART ---
// Extracted to keep the main render clean
const VigilHeart = ({ asset, state, onClick, heartRef, isCenter = false }: any) => {
    return (
        <motion.div 
            ref={(el: HTMLDivElement | null) => { heartRef.current[asset.id] = el }}
            className="relative group cursor-pointer"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            onClick={() => onClick(asset.id)}
        >
            {/* ORBIT RING (Only if alive) */}
            {state.isAlive && (
                <div className="absolute inset-[-10px] rounded-full border border-white/5 animate-[spin_10s_linear_infinite]" />
            )}

            {/* CONTAINER */}
            <div className={`relative rounded-full flex items-center justify-center transition-all duration-700
                ${isCenter ? 'w-28 h-28 md:w-36 md:h-36' : 'w-20 h-20 md:w-24 md:h-24'}
                ${state.isAlive 
                    ? 'shadow-[0_0_30px_rgba(255,100,50,0.3)] border border-white/20 bg-black' 
                    : 'opacity-40 border border-white/5 bg-white/5 hover:opacity-60'}
                ${state.isMine ? 'ring-1 ring-white/50 shadow-[0_0_40px_rgba(255,255,255,0.2)]' : ''}
            `}>
                
                {/* CONTENT */}
                <div className="w-full h-full rounded-full overflow-hidden relative z-10">
                    {state.isAlive ? (
                        <video src={asset.loop} autoPlay loop muted playsInline className="w-full h-full object-cover scale-110" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-white/10" />
                        </div>
                    )}
                </div>

                {/* LABEL (Strictly positioned below) */}
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center w-[120px] pointer-events-none">
                    <span className={`text-[9px] tracking-[0.2em] font-mono uppercase transition-all duration-300
                        ${state.isAlive ? 'text-white' : 'text-white/20'}
                    `}>
                        {state.isAlive ? state.owner : 'VOID'}
                    </span>
                    {state.isAlive && state.intention && (
                        <span className="text-[8px] font-serif italic text-white/40 mt-0.5 truncate max-w-full opacity-0 group-hover:opacity-100 transition-opacity">
                            {state.intention}
                        </span>
                    )}
                </div>

            </div>
        </motion.div>
    )
}