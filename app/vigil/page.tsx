/* ===== FILE: app/vigil/page.tsx ===== */

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
  
  // Telegram / Temple Auth State
  const [templeToken, setTempleToken] = useState<string | null>(null);
  const [templeUserName, setTempleUserName] = useState<string | null>(null);

  const { user } = useAuth();
  const ModernLoginModal = dynamic(() => import('@/components/ModernLoginModal'), { ssr: false });
  
  const angelRef = useRef<HTMLDivElement | null>(null);
  const heartRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const supabase = createClient();

  useEffect(() => {
    fetchHearts();
    
    // Check for Temple Session (Telegram)
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('temple_session_token');
        const tName = localStorage.getItem('temple_user');
        if (token) setTempleToken(token);
        if (tName) setTempleUserName(tName);
    }

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
    
    // Ownership logic: Supabase ID OR Name match (for Telegram users)
    let isMine = false;
    if (user && dbRecord.owner_id === user.id) {
        isMine = true;
    } else if (templeUserName && dbRecord.owner_name === templeUserName) {
        // Fallback for Telegram users since we don't have their ID client-side easily
        isMine = true;
    }

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
    // CRITICAL FIX: Allow access if Supabase User OR Temple Token exists
    if (!user && !templeToken) {
      setShowLogin(true);
      return;
    }

    const state = getHeartState(heartId);

    if (state.isAlive && !state.isMine) {
        if (user?.id === ADMIN_ID) {
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
        // Pre-fill name: Supabase email OR Telegram display name
        const prefill = user?.email?.split('@')[0] || templeUserName || '';
        setNameInput(prefill);
        setIntentionInput('');
    }
  };

  const triggerRitual = async () => {
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
            // Not signed in via Supabase: attempt server-side claim via temple_session (Telegram/Dev)
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