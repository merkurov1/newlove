'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthContext'; // Предполагаем, что этот контекст работает
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';

// --- ASSETS ---
const HEARTS_DATA = [
  { id: 1, static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0964.jpeg', loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-7916633362072566540.mp4' },
  { id: 2, static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0962.jpeg', loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-6228877831163806687.mp4' },
  { id: 3, static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0957.jpeg', loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-8682541785678079730.mp4' },
  { id: 4, static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0960.jpeg', loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1607792915860564384.mp4' },
  { id: 5, static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0955.jpeg', loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-5300087847065473569.mp4' }
];

const ANGEL_IMAGE = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';

// --- TYPES ---
interface HeartData {
  id: number;
  owner_name: string | null;
  owner_id?: string | null;
  last_lit_at: string;
}

interface SparkParticle {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// --- COMPONENT ---
export default function VigilPage() {
  const [dbHearts, setDbHearts] = useState<HeartData[]>([]);
  const [showManifesto, setShowManifesto] = useState(false);
  const [selectedHeart, setSelectedHeart] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [sparkParticles, setSparkParticles] = useState<SparkParticle[]>([]);
  
  // UX States
  const [isLighting, setIsLighting] = useState(false);
  const [flash, setFlash] = useState(false); // Global flash effect
  const [angelActive, setAngelActive] = useState(false); // Angel reaction state
  const [showLogin, setShowLogin] = useState(false);
  const [debugMessage, setDebugMessage] = useState<string>('');

  const { user } = useAuth(); // Get user directly from context
  const ModernLoginModal = dynamic(() => import('@/components/ModernLoginModal'), { ssr: false });
  
  const angelRef = useRef<HTMLDivElement>(null);
  const heartRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const supabase = createClient();

  // --- INITIALIZATION ---
  useEffect(() => {
    fetchHearts();
    
    // Realtime subscription
    const channel = supabase
      .channel('vigil_hearts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vigil_hearts' }, () => fetchHearts())
      .subscribe();

    // Check first visit
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

  // --- CALCULATE VISUAL STATE (Entropy) ---
  const getHeartState = (heartId: number) => {
    const dbRecord = dbHearts.find(h => h.id === heartId);
    if (!dbRecord || !dbRecord.last_lit_at) {
      return { isAlive: false, owner: null, isMine: false, filter: 'grayscale(100%) brightness(0.3)', glow: 'none', scale: 0.95 };
    }

    const now = new Date();
    const litTime = new Date(dbRecord.last_lit_at);
    const hoursPassed = (now.getTime() - litTime.getTime()) / (1000 * 60 * 60);
    const isAlive = hoursPassed < 24;
    const isMine = user ? dbRecord.owner_id === user.id : false;

    let filter = '', glow = '', scale = 1;

    if (isAlive) {
      if (hoursPassed < 6) {
        filter = 'brightness(1.2) saturate(1.3)';
        glow = '0 0 40px rgba(255, 50, 50, 0.7)';
        scale = 1.05;
      } else if (hoursPassed < 12) {
        filter = 'brightness(1) saturate(1)';
        glow = '0 0 20px rgba(255, 50, 50, 0.4)';
        scale = 1;
      } else {
        filter = 'grayscale(0.7) brightness(0.6)';
        glow = '0 0 5px rgba(255, 50, 50, 0.1)';
        scale = 0.97;
      }
    } else {
      filter = 'grayscale(100%) brightness(0.3)';
      glow = 'none';
      scale = 0.95;
    }

    return { isAlive, owner: isAlive ? dbRecord.owner_name : null, isMine, filter, glow, scale };
  };

  // --- INTERACTION ---
  const handleHeartClick = (heartId: number) => {
    // 1. Check Auth IMMEDIATELY
    if (!user) {
      setShowLogin(true);
      return;
    }

    const state = getHeartState(heartId);

    // 2. Check Ownership Logic
    if (state.isAlive && !state.isMine) {
      setDebugMessage(`Occupied by ${state.owner}. Wait for the light to fade.`);
      setTimeout(() => setDebugMessage(''), 3000);
      return;
    }

    // 3. Prepare Ritual
    setSelectedHeart(heartId);
    // If re-igniting, pre-fill name
    setNameInput(state.isMine && state.owner ? state.owner : (user.email?.split('@')[0] || ''));
  };

  const triggerRitual = async () => {
    if (!selectedHeart || !nameInput.trim() || isLighting || !user) return;
    
    setIsLighting(true);
    setSelectedHeart(null); // Close modal immediately for cinema effect

    const angelRect = angelRef.current?.getBoundingClientRect();
    const targetRect = heartRefs.current[selectedHeart]?.getBoundingClientRect();

    if (angelRect && targetRect) {
      // CALIBRATION: Candle Tip Position
      const startX = angelRect.left + (angelRect.width * 0.85);
      const startY = angelRect.top + (angelRect.height * 0.55);
      
      const endX = targetRect.left + (targetRect.width / 2);
      const endY = targetRect.top + (targetRect.height / 2);

      const sparkId = `spark-${Date.now()}`;
      
      // 1. Angel Reacts (Gathers energy)
      setAngelActive(true);

      // 2. Launch Spark (Wait a tiny bit for angel reaction)
      setTimeout(() => {
        setSparkParticles(prev => [...prev, { id: sparkId, startX, startY, endX, endY }]);
      }, 200);

      // 3. Impact & DB Update (After flight duration)
      setTimeout(async () => {
        // Visual Impact
        setFlash(true); 
        setAngelActive(false);
        setTimeout(() => setFlash(false), 300); // Flash duration

        // Clean up spark
        setSparkParticles(prev => prev.filter(s => s.id !== sparkId));

        // DB Write
        const { error } = await supabase
          .from('vigil_hearts')
          .upsert({
            id: selectedHeart,
            owner_name: nameInput.trim(),
            owner_id: user.id,
            last_lit_at: new Date().toISOString()
          });

        setIsLighting(false);
        
        if (error) setDebugMessage('Error saving light.');
      }, 2500); // Total duration (matches animation)
    } else {
      setIsLighting(false);
    }
  };

  return (
    <div className="vigil-container">
      {/* GLOBAL FLASH EFFECT */}
      <div 
        style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99999,
          opacity: flash ? 0.2 : 0, transition: 'opacity 0.1s ease-out', background: 'white'
        }} 
      />

      {/* DEBUG TOAST */}
      <AnimatePresence>
        {debugMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 20, left: '50%', x: '-50%',
              background: 'rgba(20,0,0,0.9)', border: '1px solid #500', color: '#f88',
              padding: '10px 20px', borderRadius: 4, fontFamily: 'monospace', zIndex: 10000
            }}
          >
            {debugMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <button className="info-button" onClick={() => setShowManifesto(true)}>?</button>

      <div className="room">
        {/* ANGEL */}
        <div 
          className="angel-layer" 
          ref={angelRef}
          style={{ 
            filter: angelActive ? 'brightness(1.3) drop-shadow(0 0 20px gold)' : 'brightness(1)',
            transition: 'filter 0.5s ease'
          }}
        >
          <img src={ANGEL_IMAGE} className="angel-img" alt="Watcher" />
        </div>

        {/* HEARTS GRID */}
        <div className="shelves-grid">
          {HEARTS_DATA.map((asset) => {
            const state = getHeartState(asset.id);
            return (
              <div 
                key={asset.id}
                ref={el => { heartRefs.current[asset.id] = el }}
                className="heart-slot"
                onClick={() => handleHeartClick(asset.id)}
                style={{ 
                  transform: `scale(${state.scale})`,
                  cursor: (state.isAlive && !state.isMine) ? 'not-allowed' : 'pointer'
                }}
              >
                <div 
                  className="heart-inner"
                  style={{ 
                    filter: state.filter, 
                    boxShadow: state.glow,
                    border: state.isMine ? '1px solid rgba(255,255,255,0.2)' : 'none'
                  }}
                >
                  {state.isAlive ? (
                    <video src={asset.loop} autoPlay loop muted playsInline className="heart-content" />
                  ) : (
                    <img src={asset.static} className="heart-content" alt="Empty" />
                  )}
                </div>
                <div className="heart-label">
                  {state.isAlive ? state.owner : "VACANT"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SPARK ANIMATION LAYER */}
      <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',pointerEvents:'none',zIndex:9999}}>
        <AnimatePresence>
          {sparkParticles.map(spark => (
            <motion.div
              key={spark.id}
              className="spark"
              initial={{ x: spark.startX, y: spark.startY, opacity: 0, scale: 0.5 }}
              animate={{ 
                x: spark.endX, 
                y: spark.endY, 
                opacity: [0, 1, 1, 0], 
                scale: [0.5, 1.5, 0.5] 
              }}
              transition={{ 
                duration: 2.2, // SLOW FLIGHT
                ease: "easeInOut",
                times: [0, 0.1, 0.9, 1]
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* MODALS */}
      {selectedHeart !== null && (
        <div className="modal-backdrop" onClick={() => setSelectedHeart(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif text-2xl mb-4">
              {hearts_are_mine(selectedHeart) ? "REIGNITE SOUL" : "CLAIM VESSEL"}
            </h3>
            <input 
              autoFocus
              type="text" 
              placeholder="Your Name" 
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isLighting && triggerRitual()}
              disabled={isLighting}
              className="w-full bg-black border border-gray-800 p-3 mb-6 text-center font-mono text-white focus:border-white outline-none"
            />
            <button 
              onClick={triggerRitual}
              disabled={isLighting || !nameInput.trim()}
              className="w-full bg-white text-black py-3 font-mono font-bold hover:opacity-90 disabled:opacity-50"
            >
              {isLighting ? 'IGNITING...' : 'TRANSFER SPARK'}
            </button>
          </div>
        </div>
      )}

      {/* LOGIN MODAL TRIGGER */}
      {showLogin && (
        <ModernLoginModal onClose={() => setShowLogin(false)} />
      )}

      {/* MANIFESTO */}
      {showManifesto && (
        <div className="modal-backdrop" onClick={() => setShowManifesto(false)}>
          <div className="modal-box manifesto" onClick={e => e.stopPropagation()}>
            <h2 className="font-serif text-3xl mb-6 tracking-widest">THE VIGIL</h2>
            <div className="text-gray-400 font-mono text-sm leading-relaxed space-y-4 mb-8">
              <p>The Internet is a cold void.<br/>Matter is dead until you touch it.</p>
              <p>These hearts are vessels.<br/>Click to transfer a spark of attention.<br/>Keep them warm, or they will turn to stone in 24 hours.</p>
              <p className="italic text-white mt-4">We keep each other warm in the dark.</p>
            </div>
            <button onClick={() => setShowManifesto(false)} className="px-8 py-2 border border-white/30 hover:bg-white hover:text-black transition-colors font-mono text-sm">ENTER</button>
          </div>
        </div>
      )}

      <style jsx global>{`
        body { margin: 0; background: #050505; color: white; overflow: hidden; }
        
        .vigil-container {
          position: relative;
          width: 100vw; height: 100vh;
          background: radial-gradient(circle at 50% 90%, #1a1a1a 0%, #000000 80%);
          perspective: 1200px;
          display: flex; justify-content: center; align-items: center;
        }

        .spark {
          position: absolute;
          width: 12px; height: 12px;
          background: #fff;
          border-radius: 50%;
          box-shadow: 
            0 0 10px 2px rgba(255, 255, 255, 0.8),
            0 0 20px 10px rgba(255, 200, 50, 0.4),
            0 0 40px 20px rgba(255, 100, 0, 0.2);
        }

        .info-button {
          position: absolute; top: 30px; right: 30px;
          width: 36px; height: 36px; border-radius: 50%;
          border: 1px solid #333; color: #666; background: transparent;
          font-family: 'Times New Roman', serif; font-style: italic;
          cursor: pointer; transition: all 0.3s; z-index: 100;
        }
        .info-button:hover { border-color: #fff; color: #fff; transform: scale(1.1); }

        .room {
          width: 100%; max-width: 1400px; height: 85vh;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          transform-style: preserve-3d;
        }

        .angel-layer {
          position: relative; z-index: 20; margin-bottom: 60px;
          animation: float 8s ease-in-out infinite;
        }
        .angel-img { width: 220px; opacity: 0.9; display: block; }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }

        .shelves-grid {
          display: grid; grid-template-columns: repeat(5, 1fr); gap: 40px;
          width: 100%; padding: 0 40px; z-index: 10;
        }

        @media (max-width: 768px) {
          .shelves-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            overflow-y: auto;
            max-height: 55vh;
            padding-bottom: 100px; /* Space for scrolling */
          }
          .angel-img { width: 160px; margin-bottom: 20px; }
        }

        .heart-slot {
          display: flex; flex-direction: column; align-items: center; gap: 15px;
          transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .heart-slot:hover { transform: translateY(-10px) scale(1.05); }

        .heart-inner {
          width: 140px; height: 140px;
          border-radius: 50%; overflow: hidden; background: #000;
          transition: all 1.5s ease;
          position: relative;
        }
        
        .heart-content { width: 100%; height: 100%; object-fit: cover; }

        .heart-label {
          font-family: 'Space Mono', monospace; font-size: 11px;
          color: #444; text-transform: uppercase; letter-spacing: 2px;
          height: 20px;
        }

        .modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.85);
          backdrop-filter: blur(8px); z-index: 500;
          display: flex; justify-content: center; align-items: center;
        }
        .modal-box {
          background: #0a0a0a; border: 1px solid #333;
          padding: 50px; text-align: center; max-width: 450px; width: 90%;
          box-shadow: 0 20px 50px rgba(0,0,0,0.8);
        }
      `}</style>
    </div>
  );

  // Helper to check ownership safely inside render
  function hearts_are_mine(heartId: number) {
    if (!user) return false;
    const h = dbHearts.find(x => x.id === heartId);
    return h && h.owner_id === user.id;
  }
}