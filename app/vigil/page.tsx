"use client";

import * as React from "react";
import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthContext'; 
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import TempleWrapper from '@/components/TempleWrapper';
import { templeTrack } from '@/components/templeTrack';
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

// Используем статичное изображение Ангела для иконки, если гифка тяжелая, или ту же гифку
const ANGEL_IMAGE = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';

export default function VigilPage() {
  const [dbHearts, setDbHearts] = useState<any[]>([]);
  const [showManifesto, setShowManifesto] = useState(false);
  const [selectedHeart, setSelectedHeart] = useState<number | null>(null);
  
  const [nameInput, setNameInput] = useState('');
  const [intentionInput, setIntentionInput] = useState('');

  const [sparkParticles, setSparkParticles] = useState<any[]>([]);
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

  // --- LOGIC ---
  const triggerHaptic = (style: 'light' | 'medium' | 'heavy' | 'error') => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
        if (style === 'error') tg.HapticFeedback.notificationOccurred('error');
        else tg.HapticFeedback.impactOccurred(style);
    }
  };

  useEffect(() => {
    // Auth & Telegram Init Logic (Keep as is)
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
        }
    };
    if ((window as any).Telegram?.WebApp) initTelegram();

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

  const fetchHearts = async () => {
    const { data } = await supabase.from('vigil_hearts').select('*');
    if (data) setDbHearts(data);
  };

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

    if (state.isAlive && !state.isMine && user?.id !== ADMIN_ID) {
        triggerHaptic('error');
        setDebugMessage(`LOCKED BY ${state.owner}`);
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
    
    // Spark Logic
    const heartIdToUpdate = selectedHeart;
    const angelRect = angelRef.current?.getBoundingClientRect();
    const targetRect = heartRefs.current[heartIdToUpdate]?.getBoundingClientRect();

    if (angelRect && targetRect) {
      const startX = angelRect.left + (angelRect.width / 2);
      const startY = angelRect.top + (angelRect.height / 2);
      const endX = targetRect.left + (targetRect.width / 2);
      const endY = targetRect.top + (targetRect.height / 2);

      const sparkId = `spark-${Date.now()}`;
      setSparkParticles(prev => [...prev, { id: sparkId, startX, startY, endX, endY }]);
      setSelectedHeart(null);

      setTimeout(async () => {
        setFlash(true);
        triggerHaptic('heavy');
        setTimeout(() => setFlash(false), 300);
        setSparkParticles(prev => prev.filter(s => s.id !== sparkId));

        // DB Update Logic (Same as before)
        try {
            if (user && user.id) {
                await supabase.from('vigil_hearts').update({owner_id: null, owner_name: null, last_lit_at: null}).eq('owner_id', user.id).neq('id', heartIdToUpdate);
                await supabase.from('vigil_hearts').upsert({ id: heartIdToUpdate, owner_name: nameInput.trim(), owner_id: user.id, intention: intentionInput.trim(), last_lit_at: new Date().toISOString() });
            } else {
                const token = templeToken || localStorage.getItem('temple_session_token');
                const body: any = { id: heartIdToUpdate, name: nameInput.trim(), intention: intentionInput.trim() };
                if (token) body.token = token;
                await fetch('/api/vigil/claim', { method: 'POST', body: JSON.stringify(body) });
            }
        } catch (e) { console.error(e) }
        setIsLighting(false);
      }, 1000);
    } else {
        setIsLighting(false);
        setSelectedHeart(null);
    }
  };

  return (
    <div className="vigil-root relative w-full h-[100dvh] bg-[#050505] overflow-hidden flex flex-col font-sans selection:bg-red-500/30">
      <Suspense fallback={null}><TempleWrapper /></Suspense>

      {/* --- BACKGROUND --- */}
      {/* Subtle Gradient from Top */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-zinc-900/30 via-[#050505] to-[#000000]" />
      {/* Noise Texture */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
      {/* Flash */}
      <div className={`absolute inset-0 bg-white z-[9999] pointer-events-none transition-opacity duration-300 ease-out ${flash ? 'opacity-20' : 'opacity-0'}`} />

      {/* --- HEADER (THE ANGEL TOTEM) --- */}
      <div className="relative z-20 flex flex-col items-center pt-8 md:pt-12 shrink-0">
        <div ref={angelRef} className="relative w-16 h-16 md:w-20 md:h-20 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.05)]">
            <img src={ANGEL_IMAGE} className="w-10 md:w-12 opacity-80 contrast-125 grayscale" alt="Angel" />
        </div>
        <h1 className="mt-4 text-[10px] tracking-[0.4em] text-white/40 uppercase font-mono">
            Temple of Love
        </h1>
      </div>

      {/* --- INFO BUTTON --- */}
      <button onClick={() => setShowManifesto(true)} className="absolute top-6 right-6 z-50 text-white/30 hover:text-white transition-colors">
        <InfoIcon className="w-5 h-5" />
      </button>

      {/* --- MAIN GRID (THE X FORMATION) --- */}
      <div className="relative z-10 flex-grow flex items-center justify-center p-6">
        <div className="grid grid-cols-3 gap-4 md:gap-8 aspect-square w-full max-w-[320px] md:max-w-[400px]">
            
            {/* ROW 1: LEFT, VOID, RIGHT */}
            <Slot asset={HEARTS_DATA[0]} state={getHeartState(HEARTS_DATA[0].id)} onClick={handleHeartClick} refs={heartRefs} />
            <div className="pointer-events-none" /> {/* Empty Center Top */}
            <Slot asset={HEARTS_DATA[1]} state={getHeartState(HEARTS_DATA[1].id)} onClick={handleHeartClick} refs={heartRefs} />

            {/* ROW 2: VOID, CENTER (KEYSTONE), VOID */}
            <div className="pointer-events-none" />
            <Slot asset={HEARTS_DATA[2]} state={getHeartState(HEARTS_DATA[2].id)} onClick={handleHeartClick} refs={heartRefs} isCenter />
            <div className="pointer-events-none" />

            {/* ROW 3: LEFT, VOID, RIGHT */}
            <Slot asset={HEARTS_DATA[3]} state={getHeartState(HEARTS_DATA[3].id)} onClick={handleHeartClick} refs={heartRefs} />
            <div className="pointer-events-none" />
            <Slot asset={HEARTS_DATA[4]} state={getHeartState(HEARTS_DATA[4].id)} onClick={handleHeartClick} refs={heartRefs} />

        </div>
      </div>

      {/* --- FOOTER / STATUS --- */}
      <div className="relative z-20 pb-8 text-center shrink-0">
        <AnimatePresence mode="wait">
            {debugMessage ? (
                <motion.p initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="text-red-400 text-[10px] font-mono tracking-widest">
                    {debugMessage}
                </motion.p>
            ) : (
                <p className="text-white/20 text-[10px] font-mono tracking-widest">
                    {dbHearts.filter(h => new Date(h.last_lit_at).getTime() > Date.now() - 86400000).length} / 5 FLAMES BURNING
                </p>
            )}
        </AnimatePresence>
      </div>

      {/* --- PARTICLES --- */}
      <AnimatePresence>
        {sparkParticles.map(spark => (
            <motion.div
                key={spark.id}
                className="fixed w-1 h-1 bg-white rounded-full z-[9999] shadow-[0_0_15px_white]"
                initial={{ x: spark.startX, y: spark.startY, opacity: 1 }}
                animate={{ x: spark.endX, y: spark.endY, opacity: 0 }}
                transition={{ duration: 0.8, ease: "circIn" }}
            />
        ))}
      </AnimatePresence>

      {/* --- BOTTOM SHEET --- */}
      <AnimatePresence>
        {selectedHeart !== null && (
            <>
                <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90]" onClick={() => setSelectedHeart(null)} />
                <motion.div initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}} transition={{type:"spring", damping:25}} className="fixed bottom-0 w-full bg-[#0F0F0F] border-t border-white/10 rounded-t-2xl z-[100] p-6 pb-10">
                    <div className="w-full max-w-xs mx-auto space-y-6">
                        <div className="text-center">
                            <h3 className="text-white font-serif text-lg">Ignite Slot {selectedHeart}</h3>
                            <p className="text-white/30 text-[10px] font-mono mt-1">THIS WILL EXTINGUISH YOUR PREVIOUS FLAME</p>
                        </div>
                        <input type="text" placeholder="YOUR NAME" maxLength={15} className="w-full bg-transparent border-b border-white/20 text-center text-white py-2 font-mono uppercase focus:outline-none focus:border-white" value={nameInput} onChange={e => setNameInput(e.target.value.toUpperCase())} autoFocus />
                        <input type="text" placeholder="intention (optional)" maxLength={30} className="w-full bg-transparent border-b border-white/20 text-center text-white/60 py-2 font-serif italic focus:outline-none focus:border-white" value={intentionInput} onChange={e => setIntentionInput(e.target.value)} />
                        <button onClick={triggerRitual} disabled={!nameInput.trim() || isLighting} className="w-full bg-white text-black py-4 font-mono text-[10px] tracking-[0.3em] uppercase hover:bg-gray-200 disabled:opacity-50">
                            {isLighting ? "IGNITING..." : "LIGHT"}
                        </button>
                    </div>
                </motion.div>
            </>
        )}
      </AnimatePresence>

      {/* --- MANIFESTO --- */}
      <AnimatePresence>
        {showManifesto && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-8" onClick={() => setShowManifesto(false)}>
                <div className="max-w-xs text-center space-y-6" onClick={e => e.stopPropagation()}>
                    <InfoIcon className="w-8 h-8 text-white/50 mx-auto" />
                    <p className="text-white/60 text-xs font-mono leading-relaxed">
                        5 Slots. 24 Hours.<br/>
                        Lighting a flame creates a digital spark.<br/>
                        If you light a new one, your old one dies.
                    </p>
                    <button onClick={() => setShowManifesto(false)} className="border border-white/20 px-8 py-3 text-white text-[10px] tracking-widest hover:bg-white hover:text-black transition-colors">ENTER</button>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {showLogin && <ModernLoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}

// --- SLOT COMPONENT ---
const Slot = ({ asset, state, onClick, refs, isCenter }: any) => {
  return (
    <motion.div 
      ref={(el: HTMLDivElement | null) => { refs.current[asset.id] = el }}
            onClick={() => onClick(asset.id)}
            className={`relative rounded-full border flex items-center justify-center overflow-hidden cursor-pointer transition-all duration-500
                ${isCenter ? 'w-24 h-24 md:w-32 md:h-32' : 'w-20 h-20 md:w-24 md:h-24'}
                ${state.isAlive 
                    ? 'border-white/20 shadow-[0_0_20px_rgba(255,100,50,0.3)]' 
                    : 'border-white/5 bg-white/[0.03] hover:border-white/20'}
            `}
            whileTap={{ scale: 0.95 }}
        >
            {state.isAlive ? (
                <>
                    <video src={asset.loop} autoPlay loop muted playsInline className="w-full h-full object-cover opacity-90 scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <span className="absolute bottom-3 text-[8px] text-white font-mono tracking-widest uppercase truncate max-w-[80%]">
                        {state.owner}
                    </span>
                </>
            ) : (
                <div className="flex flex-col items-center opacity-30">
                    <div className="w-1.5 h-1.5 bg-white rounded-full mb-2" />
                    <span className="text-[8px] font-mono tracking-widest">VOID</span>
                </div>
            )}
        </motion.div>
    );
}