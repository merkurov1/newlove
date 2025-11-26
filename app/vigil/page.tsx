"use client";

import * as React from "react";
import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthContext'; 
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import TempleWrapper from '@/components/TempleWrapper';
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
  const [shakingHeartId, setShakingHeartId] = useState<number | null>(null);
  
  // Telegram / Temple Auth State
  const [templeToken, setTempleToken] = useState<string | null>(null);
  const [templeUserName, setTempleUserName] = useState<string | null>(null);

  const { user } = useAuth();
  const ModernLoginModal = dynamic(() => import('@/components/ModernLoginModal'), { ssr: false });
  
  const angelRef = useRef<HTMLDivElement | null>(null);
  const heartRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const supabase = createClient();

  // --- HELPER: Haptics ---
  const triggerHaptic = (style: 'light' | 'medium' | 'heavy' | 'error') => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
        if (style === 'error') tg.HapticFeedback.notificationOccurred('error');
        else tg.HapticFeedback.impactOccurred(style);
    }
  };

  useEffect(() => {
    // 1. Session Sync
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('temple_session_token');
      const storedUser = localStorage.getItem('temple_user');
      if (storedToken) setTempleToken(storedToken);
      if (storedUser) setTempleUserName(storedUser);
    }

    // 2. Telegram Init
    const initTelegram = () => {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
            tg.ready();
            tg.expand();
            tg.setHeaderColor('#000000');
            tg.setBackgroundColor('#000000');
            
            const initData = tg.initData;
            const tgUser = tg.initDataUnsafe?.user;
            
            // Silent Auth Update
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

    // 3. Data Sync
    fetchHearts();
    const channel = supabase
      .channel('vigil_hearts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, () => fetchHearts())
      .subscribe();

    // 4. First Visit Check
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

  // --- ATMOSPHERE ENGINE ---
  const getRoomStyle = (count: number) => {
    // 0-1: Void (Darkness)
    // 2-3: Dusk (Glow starts)
    // 4: Dawn (Bright)
    // 5: Glory (Golden/Red)
    
    if (count <= 1) return {
        bg: 'radial-gradient(circle at 50% 90%, #151515 0%, #000000 85%)',
        angelOpacity: 0.5,
        angelFilter: 'grayscale(100%) brightness(0.6)',
        roomFilter: 'brightness(0.6)'
    };
    if (count <= 3) return {
        bg: 'radial-gradient(circle at 50% 80%, #2a1a1a 0%, #050505 100%)',
        angelOpacity: 0.8,
        angelFilter: 'grayscale(60%) brightness(0.9)',
        roomFilter: 'brightness(1.0)'
    };
    if (count === 4) return {
        bg: 'radial-gradient(circle at 50% 70%, #4a1a1a 0%, #0a0a0a 100%)',
        angelOpacity: 0.95,
        angelFilter: 'grayscale(20%) brightness(1.1) drop-shadow(0 0 10px rgba(255,100,100,0.2))',
        roomFilter: 'brightness(1.1) contrast(1.1)'
    };
    // FULL VIGIL (5)
    return {
        bg: 'radial-gradient(circle at 50% 60%, #550000 0%, #1a0000 60%, #000000 100%)',
        angelOpacity: 1,
        angelFilter: 'grayscale(0%) brightness(1.3) sepia(20%) drop-shadow(0 0 30px rgba(255,50,0,0.5))',
        roomFilter: 'brightness(1.2) contrast(1.2)',
        overlay: true // Golden overlay
    };
  };

  const roomStyle = getRoomStyle(activeHeartsCount);

  const getHeartState = (heartId: number) => {
    const dbRecord = dbHearts.find(h => h.id === heartId);
    if (!dbRecord || !dbRecord.last_lit_at) {
      return { isAlive: false, owner: null, intention: null, isMine: false, filter: 'grayscale(100%) brightness(0.2)', glow: 'none', scale: 0.95 };
    }

    const now = new Date();
    const litTime = new Date(dbRecord.last_lit_at);
    const hoursPassed = (now.getTime() - litTime.getTime()) / (1000 * 60 * 60);
    const isAlive = hoursPassed < 24;
    
    let isMine = false;
    if (user && dbRecord.owner_id === user.id) isMine = true;
    else if (templeUserName && dbRecord.owner_name === templeUserName) isMine = true;

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
    // If not logged in and not in Telegram -> Show Login
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
        // Shake visual effect
        setShakingHeartId(heartId);
        setTimeout(() => setShakingHeartId(null), 500);
        triggerHaptic('error');

        setDebugMessage(`OCCUPIED BY ${state.owner ? state.owner.toUpperCase() : 'ANOTHER'}`);
        setTimeout(() => setDebugMessage(''), 3000);
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
        triggerHaptic('heavy');
        setTimeout(() => setFlash(false), 200);

        setSparkParticles(prev => prev.filter(s => s.id !== sparkId));

        try {
          if (user && user.id) {
            // ADMIN / WEB USER LOGIC
            await supabase.from('vigil_hearts').update({owner_id: null, owner_name: null, last_lit_at: null}).eq('owner_id', user.id).neq('id', heartIdToUpdate);
            
            await supabase.from('vigil_hearts').upsert({
              id: heartIdToUpdate,
              owner_name: nameInput.trim(),
              owner_id: user.id,
              intention: intentionInput.trim(),
              last_lit_at: new Date().toISOString()
            });
          } else {
            // TELEGRAM / TEMPLE USER LOGIC
            const token = templeToken || (typeof window !== 'undefined' ? localStorage.getItem('temple_session_token') : null);
            const body: any = { id: heartIdToUpdate, name: nameInput.trim(), intention: intentionInput.trim() };
            if (token) body.token = token;

            const res = await fetch('/api/vigil/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            const j = await res.json();
            if (!res.ok) {
              if (res.status === 401) setShowLogin(true);
              else {
                  setDebugMessage(j?.error || 'CLAIM FAILED');
                  setTimeout(() => setDebugMessage(''), 3000);
              }
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
    <div className="vigil-container" style={{ background: roomStyle.bg }}>
      <Suspense fallback={null}><TempleWrapper /></Suspense>

      <div style={{display:'none'}}>
        {HEARTS_DATA.map(h => <video key={h.id} src={h.loop} preload="auto" />)}
      </div>

      {/* FLASH */}
      <div style={{
          position: 'fixed', inset: 0, background: 'white', pointerEvents: 'none', zIndex: 9999,
          opacity: flash ? 0.2 : 0, transition: 'opacity 0.2s ease-out'
      }} />

      {/* GLORY OVERLAY */}
      {roomStyle.overlay && (
          <div style={{
              position: 'fixed', inset: 0, 
              background: 'linear-gradient(180deg, rgba(255,200,0,0.05) 0%, rgba(0,0,0,0) 100%)',
              mixBlendMode: 'overlay', pointerEvents: 'none', zIndex: 5
          }} />
      )}

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

      <div className="room" style={{ filter: roomStyle.roomFilter }}>
        
        <div className="angel-layer" ref={angelRef}>
          <img 
            src={ANGEL_IMAGE} 
            className="angel-img" 
            alt="Watcher"
            style={{
                opacity: roomStyle.angelOpacity,
                filter: roomStyle.angelFilter,
                transition: 'all 2s ease'
            }} 
          />
        </div>

        <div className="shelves-grid">
          {HEARTS_DATA.map((asset) => {
            const state = getHeartState(asset.id);
            const isShaking = shakingHeartId === asset.id;
            return (
              <div 
                key={asset.id}
                ref={(el: HTMLDivElement | null) => { heartRefs.current[asset.id] = el }}
                className={`heart-slot ${isShaking ? 'shake-anim' : ''}`}
                onClick={() => handleHeartClick(asset.id)}
                style={{ 
                  transform: `scale(${state.scale})`,
                  cursor: (state.isAlive && !state.isMine && user?.id !== ADMIN_ID) ? 'default' : 'pointer'
                }}
              >
                <div className="heart-inner" style={{ 
                    filter: state.filter, 
                    boxShadow: state.glow, 
                    border: state.isMine ? '1px solid rgba(255,255,255,0.4)' : '1px solid transparent' 
                }}>
                  {state.isAlive ? (
                    <video src={asset.loop} autoPlay loop muted playsInline className="heart-content" />
                  ) : (
                    <img src={asset.static} className="heart-content" alt="Empty" />
                  )}
                </div>
                
                <div className="heart-meta">
                  <div className="heart-owner" style={{ color: state.isAlive ? '#fff' : '#444' }}>
                    {state.isAlive ? state.owner : "VACANT"}
                  </div>
                  {state.isAlive && state.intention && (
                    <div className="heart-intention">{state.intention}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SPARKS */}
      <div className="spark-layer">
        <AnimatePresence>
          {sparkParticles.map(spark => (
            <motion.div
              key={spark.id}
              className="spark"
              initial={{ x: spark.startX, y: spark.startY, opacity: 0, scale: 0.2 }}
              animate={{ 
                x: spark.endX, y: spark.endY, opacity: [0, 1, 1, 0.8], scale: [0.2, 1.5, 0.5] 
              }}
              transition={{ duration: 2.5, ease: "easeInOut", times: [0, 0.2, 0.9, 1] }}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* RITUAL MODAL */}
      {selectedHeart !== null && (
        <div className="modal-backdrop" onClick={() => setSelectedHeart(null)}>
          <div className="modal-box" onClick={(e) => (e as React.MouseEvent<HTMLDivElement>).stopPropagation()}>
            
            {user?.id === ADMIN_ID && getHeartState(selectedHeart).isAlive && !getHeartState(selectedHeart).isMine ? (
                <>
                    <h3>ADMIN CONTROL</h3>
                    <p className="text-sm text-gray-400 mb-4">Owned by: {getHeartState(selectedHeart).owner}</p>
                    <button onClick={triggerExtinguish} className="btn-danger">EXTINGUISH</button>
                </>
            ) : (
                <>
                    <h3>{getHeartState(selectedHeart).isMine ? "REIGNITE FLAME" : "CLAIM VESSEL"}</h3>
                    
                    <div className="input-group">
                        <label>YOUR NAME</label>
                        <input 
                            autoFocus type="text" placeholder="NAME" maxLength={15}
                            value={nameInput} onChange={(e) => setNameInput((e.target as HTMLInputElement).value.toUpperCase())}
                        />
                    </div>
                    
                    <div className="input-group">
                        <label>INTENTION (OPTIONAL)</label>
                        <input 
                            type="text" placeholder="SILENCE / LOVE / BITCOIN" maxLength={30}
                            value={intentionInput} onChange={(e) => setIntentionInput((e.target as HTMLInputElement).value)}
                            onKeyDown={(e) => (e as React.KeyboardEvent<HTMLInputElement>).key === 'Enter' && !isLighting && triggerRitual()}
                        />
                    </div>

                    <p className="text-xs text-gray-500 mb-4 font-mono">
                        By lighting this heart, you extinguish your previous flame. <br/>One soul, one vessel.
                    </p>

                    <button 
                        onClick={triggerRitual} 
                        disabled={isLighting || !nameInput.trim()}
                        className="btn-primary"
                    >
                        {isLighting ? 'IGNITING...' : 'IGNITE'}
                    </button>
                </>
            )}
          </div>
        </div>
      )}

      {showLogin && <ModernLoginModal onClose={() => setShowLogin(false)} />}

      {/* MANIFESTO MODAL */}
      {showManifesto && (
        <div className="modal-backdrop" onClick={() => setShowManifesto(false)}>
          <div className="modal-box manifesto" onClick={(e) => (e as React.MouseEvent<HTMLDivElement>).stopPropagation()}>
            <h2 className="glitch-text" data-text="THE VIGIL">THE VIGIL</h2>
            <div className="manifesto-content">
                <p>The Internet is a cold void.</p>
                <p>These 5 hearts are digital vessels. They are dead matter until you touch them.</p>
                <p>Click to transfer a <b>Spark</b>.</p>
                <p>Rules:<br/>1. You can hold only <b>ONE</b> heart.<br/>2. Fire dies in 24 hours.<br/>3. Keep the Temple warm.</p>
                <p className="italic">"We keep each other warm in the dark."</p>
            </div>
            <button className="btn-enter" onClick={() => setShowManifesto(false)}>ENTER THE VOID</button>
          </div>
        </div>
      )}

      <style jsx global>{`
        body { margin: 0; background: #000; color: #eee; overflow: hidden; font-family: 'Inter', sans-serif; }
        
        .vigil-container {
          width: 100vw; height: 100vh;
          transition: background 2s ease;
          perspective: 1200px;
          display: flex; justify-content: center; align-items: center;
          position: relative;
        }

        /* GLITCH EFFECT */
        .glitch-text {
            position: relative; color: white;
            font-family: 'Space Mono', monospace; font-size: 32px; letter-spacing: -2px; margin-bottom: 30px; text-align: center;
        }
        .glitch-text::before, .glitch-text::after {
            content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        }
        .glitch-text::before {
            left: 2px; text-shadow: -1px 0 #ff00c1; clip: rect(44px, 450px, 56px, 0);
            animation: glitch-anim 5s infinite linear alternate-reverse;
        }
        .glitch-text::after {
            left: -2px; text-shadow: -1px 0 #00fff9; clip: rect(44px, 450px, 56px, 0);
            animation: glitch-anim2 5s infinite linear alternate-reverse;
        }
        @keyframes glitch-anim {
            0% { clip: rect(12px, 9999px, 81px, 0); }
            20% { clip: rect(83px, 9999px, 40px, 0); }
            40% { clip: rect(22px, 9999px, 6px, 0); }
            60% { clip: rect(64px, 9999px, 19px, 0); }
            80% { clip: rect(3px, 9999px, 58px, 0); }
            100% { clip: rect(93px, 9999px, 30px, 0); }
        }
        @keyframes glitch-anim2 {
            0% { clip: rect(65px, 9999px, 100px, 0); }
            20% { clip: rect(32px, 9999px, 4px, 0); }
            40% { clip: rect(10px, 9999px, 63px, 0); }
            60% { clip: rect(80px, 9999px, 20px, 0); }
            80% { clip: rect(1px, 9999px, 50px, 0); }
            100% { clip: rect(30px, 9999px, 80px, 0); }
        }

        .spark-layer { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 9999; }
        .spark {
          position: absolute; width: 6px; height: 6px; background: #fff; border-radius: 50%;
          box-shadow: 0 0 20px 5px rgba(255, 200, 50, 0.9);
        }

        .info-button {
          position: absolute; top: 20px; right: 20px; width: 40px; height: 40px; border-radius: 50%;
          border: 1px solid #333; color: #666; background: rgba(0,0,0,0.5);
          font-family: 'Space Mono', monospace; font-size: 20px; cursor: pointer; z-index: 100;
          transition: all 0.2s;
        }
        .info-button:hover { border-color: #fff; color: #fff; transform: scale(1.1); }

        .room {
          width: 100%; max-width: 1400px; height: 85vh;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          transform-style: preserve-3d; transition: filter 2s ease;
        }

        .angel-layer {
          position: relative; z-index: 20; margin-bottom: 5vh;
          animation: float 8s ease-in-out infinite;
        }
        .angel-img { width: 220px; display: block; }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-15px); } }

        .shelves-grid {
          display: grid; grid-template-columns: repeat(5, 1fr); gap: 2vw;
          width: 100%; padding: 0 20px; z-index: 10;
          max-width: 1000px;
        }

        .heart-slot {
          display: flex; flex-direction: column; align-items: center; gap: 15px;
          transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .heart-slot:active { transform: scale(0.95) !important; }
        
        .shake-anim { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }

        .heart-inner {
          width: 12vw; height: 12vw; max-width: 140px; max-height: 140px; min-width: 80px; min-height: 80px;
          border-radius: 50%; overflow: hidden; background: #000;
          transition: all 1.5s ease; position: relative;
        }
        .heart-content { width: 100%; height: 100%; object-fit: cover; }

        .heart-meta { text-align: center; min-height: 50px; display: flex; flex-direction: column; align-items: center; }
        .heart-owner { font-family: 'Space Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }
        .heart-intention { font-family: 'Times New Roman', serif; font-style: italic; font-size: 13px; color: #888; opacity: 0.8; }

        /* MODALS */
        .modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(12px); z-index: 500;
          display: flex; justify-content: center; align-items: center;
          animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal-box {
          background: #0a0a0a; border: 1px solid #333; padding: 40px; text-align: center; width: 90%; max-width: 400px;
          box-shadow: 0 0 50px rgba(0,0,0,1);
        }
        .modal-box h3 { 
            font-family: 'Space Mono', monospace; font-size: 16px; letter-spacing: 4px; margin-bottom: 30px; color: #fff; 
            border-bottom: 1px solid #333; padding-bottom: 20px;
        }

        .manifesto { max-width: 500px; text-align: left; border: 1px solid #fff; background: #000; }
        .manifesto-content p { font-family: 'Space Mono', monospace; font-size: 14px; line-height: 1.6; color: #ccc; margin-bottom: 15px; }
        .manifesto-content b { color: #fff; }
        .btn-enter { background: #fff; color: #000; border: none; padding: 15px; width: 100%; font-weight: bold; margin-top: 20px; cursor: pointer; letter-spacing: 2px; }
        .btn-enter:hover { background: #ccc; }
        
        .input-group { margin-bottom: 25px; text-align: left; }
        .input-group label { display: block; font-size: 10px; color: #666; margin-bottom: 8px; font-family: 'Space Mono', monospace; letter-spacing: 1px; }
        
        input {
          background: #000; border: 1px solid #333; color: white; padding: 15px; width: 100%;
          font-family: 'Space Mono', monospace; text-align: center; font-size: 16px; outline: none;
          text-transform: uppercase;
        }
        input:focus { border-color: #fff; }

        .btn-primary {
          background: #fff; color: #000; border: none; padding: 15px; width: 100%; 
          font-family: 'Space Mono', monospace; font-weight: bold; letter-spacing: 2px; cursor: pointer;
          transition: all 0.2s;
        }
        .btn-primary:hover:not(:disabled) { transform: scale(1.02); box-shadow: 0 0 15px rgba(255,255,255,0.3); }
        .btn-primary:disabled { background: #333; color: #666; cursor: not-allowed; }
        
        .btn-danger { background: #300; color: #f55; border: 1px solid #500; width: 100%; padding: 15px; cursor: pointer; font-family: monospace; }
        
        .debug-toast {
            position: fixed; top: 10%; left: 50%; transform: translateX(-50%);
            background: #000; border: 1px solid #f00; color: #f00;
            padding: 10px 20px; z-index: 10000; font-family: 'Space Mono', monospace; font-size: 12px;
            text-transform: uppercase;
        }

        /* MOBILE FIX */
        @media (max-width: 768px) {
          .shelves-grid { 
             grid-template-columns: repeat(2, 1fr); 
             gap: 20px; 
             max-height: 60vh; 
             overflow-y: scroll; 
             padding-bottom: 100px; 
          }
          /* Center the 5th item (odd one out) */
          .heart-slot:last-child {
             grid-column: span 2;
          }
          .angel-img { width: 150px; margin-bottom: 20px; }
          .heart-inner { width: 35vw; height: 35vw; max-width: 140px; max-height: 140px; }
        }
      `}</style>
    </div>
  );
}