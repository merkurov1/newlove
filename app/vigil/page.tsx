"use client";

import * as React from "react";
import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthContext'; 
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import TempleWrapper from '@/components/TempleWrapper';
import { templeTrack } from '@/components/templeTrack';
import { X, Info, Sparkles } from 'lucide-react'; // Убедись, что lucide-react установлен

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
  
  // Telegram / Temple Auth State
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
    // Session Sync
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
            // Force dark mode logic
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

  // --- ATMOSPHERE ---
  const getAtmosphere = (count: number) => {
    // Calculates the "warmth" of the room
    const intensity = Math.min(count * 0.2, 1); // 0 to 1
    return {
        overlayOpacity: intensity * 0.4, // Ambient glow
        angelOpacity: 0.4 + (intensity * 0.6), // Angel reveals itself
    };
  };
  const atmosphere = getAtmosphere(activeHeartsCount);

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
    // Don't close modal yet, wait for spark to start

    const angelRect = angelRef.current?.getBoundingClientRect();
    const targetRect = heartRefs.current[heartIdToUpdate]?.getBoundingClientRect();

    if (angelRect && targetRect) {
      // Logic for spark flight
      const startX = window.innerWidth / 2; // Start from center/angel
      const startY = window.innerHeight * 0.3; 
      const endX = targetRect.left + (targetRect.width / 2);
      const endY = targetRect.top + (targetRect.height / 2);

      const sparkId = `spark-${Date.now()}`;
      setSparkParticles(prev => [...prev, { id: sparkId, startX, startY, endX, endY }]);
      
      // Close modal now
      setSelectedHeart(null);

      // Wait for animation impact
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
            if (!res.ok) {
               if (res.status === 401) setShowLogin(true);
            }
          }
        } catch (e) {
          console.error(e);
        }
        setIsLighting(false);
      }, 1500); // Sync with animation duration
    } else {
      setIsLighting(false);
      setSelectedHeart(null);
    }
  };

  return (
    <div className="vigil-root">
      <Suspense fallback={null}><TempleWrapper /></Suspense>

      {/* Preload Videos */}
      <div style={{display:'none'}}>
        {HEARTS_DATA.map(h => <video key={h.id} src={h.loop} preload="auto" />)}
      </div>

      {/* AMBIENT BACKGROUND */}
      <div className="fixed inset-0 bg-black z-0 pointer-events-none" />
      <div 
        className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-[3000ms]"
        style={{
            background: 'radial-gradient(circle at 50% 40%, rgba(50,10,0,0.4) 0%, rgba(0,0,0,1) 80%)',
            opacity: 0.3 + atmosphere.overlayOpacity
        }}
      />
      {/* NOISE GRAIN */}
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03]" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
      />

      {/* FLASH */}
      <div className="fixed inset-0 bg-white pointer-events-none z-[9999] transition-opacity duration-500 ease-out"
           style={{ opacity: flash ? 0.3 : 0 }} />

      {/* HEADER ACTIONS */}
      <div className="fixed top-4 right-4 z-50 flex gap-4">
        <button onClick={() => setShowManifesto(true)} className="w-10 h-10 rounded-full border border-white/10 bg-black/50 backdrop-blur-md flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <Info size={18} />
        </button>
      </div>

      {/* TOASTS */}
      <AnimatePresence>
        {debugMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 bg-red-900/80 border border-red-500/30 text-red-100 px-4 py-2 text-xs font-mono tracking-widest z-[100] backdrop-blur-md"
          >
            {debugMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN STAGE */}
      <div className="relative w-full h-[100dvh] flex flex-col items-center justify-center z-10 overflow-hidden">
        
        {/* ANGEL */}
        <div ref={angelRef} className="absolute top-[10%] opacity-50 transition-all duration-[2000ms]"
             style={{ 
                 opacity: atmosphere.angelOpacity,
                 filter: `blur(${activeHeartsCount === 0 ? '5px' : '0px'}) drop-shadow(0 0 30px rgba(255,100,50,${atmosphere.overlayOpacity}))` 
             }}>
          <img src={ANGEL_IMAGE} className="w-[200px] md:w-[300px] animate-float" alt="The Watcher" />
        </div>

        {/* HEARTS GRID (MOBILE OPTIMIZED) */}
        {/* Pattern: 2 - 1 - 2 */}
        <div className="relative mt-[20vh] w-full max-w-md px-6 grid grid-cols-2 gap-y-12 gap-x-8 place-items-center">
            {HEARTS_DATA.map((asset, index) => {
                const state = getHeartState(asset.id);
                // Center the middle heart (index 2, which is the 3rd item)
                const isCenter = index === 2;
                
                return (
                    <motion.div 
                        key={asset.id}
                        ref={(el: HTMLDivElement | null) => { heartRefs.current[asset.id] = el }}
                        className={`relative group ${isCenter ? 'col-span-2 mt-4 mb-4' : ''}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.1 }}
                        onClick={() => handleHeartClick(asset.id)}
                    >
                        {/* GLOW CONTAINER */}
                        <div className={`relative w-28 h-28 md:w-32 md:h-32 rounded-full flex items-center justify-center transition-all duration-700
                            ${state.isAlive ? 'shadow-[0_0_40px_rgba(200,50,0,0.4)]' : 'opacity-60 grayscale'}
                            ${state.isMine ? 'ring-1 ring-white/30' : ''}
                        `}>
                            {/* MEDIA */}
                            <div className="w-full h-full rounded-full overflow-hidden bg-black relative z-10 border border-white/5">
                                {state.isAlive ? (
                                    <video src={asset.loop} autoPlay loop muted playsInline className="w-full h-full object-cover scale-110" />
                                ) : (
                                    <img src={asset.static} className="w-full h-full object-cover opacity-50" />
                                )}
                            </div>

                            {/* TEXT OVERLAY (BELOW) */}
                            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-40 text-center flex flex-col items-center">
                                <span className={`text-[10px] tracking-[0.2em] font-mono uppercase transition-colors duration-500
                                    ${state.isAlive ? 'text-white drop-shadow-md' : 'text-zinc-600'}
                                `}>
                                    {state.isAlive ? state.owner : 'VOID'}
                                </span>
                                {state.isAlive && state.intention && (
                                    <span className="text-[9px] font-serif italic text-white/50 mt-1 max-w-full truncate px-2">
                                        "{state.intention}"
                                    </span>
                                )}
                            </div>
                        </div>
                    </motion.div>
                );
            })}
        </div>
      </div>

      {/* SPARKS LAYER */}
      <AnimatePresence>
        {sparkParticles.map(spark => (
            <motion.div
                key={spark.id}
                className="fixed w-2 h-2 bg-white rounded-full z-[9999] shadow-[0_0_15px_white]"
                initial={{ x: spark.startX, y: spark.startY, opacity: 1, scale: 1 }}
                animate={{ x: spark.endX, y: spark.endY, opacity: 0, scale: 0.5 }}
                transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
            />
        ))}
      </AnimatePresence>

      {/* BOTTOM SHEET (RITUAL) */}
      <AnimatePresence>
        {selectedHeart !== null && (
            <>
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
                    onClick={() => !isLighting && setSelectedHeart(null)}
                />
                <motion.div 
                    initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="fixed bottom-0 left-0 right-0 bg-[#0A0A0A] border-t border-white/10 rounded-t-[30px] p-8 z-[101] flex flex-col gap-6 shadow-[0_-10px_40px_rgba(0,0,0,1)]"
                >
                    <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-2" />
                    
                    <div className="text-center">
                        <h3 className="text-xl font-serif text-white tracking-wide">
                            {getHeartState(selectedHeart).isMine ? "REIGNITE FLAME" : "CONSECRATE VESSEL"}
                        </h3>
                        <p className="text-xs text-white/40 font-mono mt-2 uppercase tracking-wider">
                            Heart #{selectedHeart}
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] text-white/40 font-mono uppercase tracking-widest ml-1">Your Name</label>
                            <input 
                                autoFocus
                                type="text" 
                                className="w-full bg-black/50 border-b border-white/20 p-4 text-center text-lg text-white font-serif placeholder:text-white/10 focus:outline-none focus:border-white/60 transition-colors uppercase"
                                placeholder="ENTER NAME"
                                maxLength={15}
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value.toUpperCase())}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-white/40 font-mono uppercase tracking-widest ml-1">Intention (Optional)</label>
                            <input 
                                type="text" 
                                className="w-full bg-black/50 border-b border-white/20 p-4 text-center text-base text-white/80 font-serif italic placeholder:text-white/10 focus:outline-none focus:border-white/60 transition-colors"
                                placeholder="for silence..."
                                maxLength={30}
                                value={intentionInput}
                                onChange={(e) => setIntentionInput(e.target.value)}
                            />
                        </div>
                    </div>

                    <button 
                        disabled={isLighting || !nameInput.trim()}
                        onClick={triggerRitual}
                        className="w-full bg-white text-black py-4 font-mono text-sm tracking-[0.2em] hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                    >
                        {isLighting ? "IGNITING..." : "LIGHT CANDLE"}
                    </button>
                </motion.div>
            </>
        )}
      </AnimatePresence>

      {/* MANIFESTO MODAL */}
      <AnimatePresence>
        {showManifesto && (
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-6"
                onClick={() => setShowManifesto(false)}
            >
                <div className="max-w-md w-full border border-white/10 p-8 relative">
                    <button onClick={() => setShowManifesto(false)} className="absolute top-4 right-4 text-white/40">
                        <X size={20}/>
                    </button>
                    <h2 className="text-2xl font-serif text-white mb-6 text-center">The Vigil</h2>
                    <div className="space-y-4 text-sm font-mono text-white/60 leading-relaxed text-justify">
                        <p>The Internet is a cold place. This is a digital hearth.</p>
                        <p>There are only 5 flames. They are dead matter until you touch them.</p>
                        <ul className="list-disc pl-4 space-y-2 border-l border-white/20 ml-2">
                            <li>You can hold only <span className="text-white">ONE</span> flame.</li>
                            <li>Lighting a new one extinguishes your old one.</li>
                            <li>The fire dies after 24 hours.</li>
                        </ul>
                        <p className="pt-4 text-center italic text-white/40 font-serif">
                            "We keep each other warm in the dark."
                        </p>
                    </div>
                    <button onClick={() => setShowManifesto(false)} className="w-full mt-8 border border-white/20 py-3 text-xs tracking-[0.2em] text-white hover:bg-white hover:text-black transition-colors">
                        ENTER
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
        .animate-float { animation: float 6s ease-in-out infinite; }
      `}</style>
    </div>
  );
}