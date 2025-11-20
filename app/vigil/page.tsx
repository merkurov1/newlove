'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { motion, AnimatePresence } from 'framer-motion';

// --- ASSETS CONFIGURATION ---
const HEARTS_DATA = [
  {
    id: 1,
    static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0964.jpeg',
    loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-7916633362072566540.mp4'
  },
  {
    id: 2,
    static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0962.jpeg',
    loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-6228877831163806687.mp4'
  },
  {
    id: 3,
    static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0957.jpeg',
    loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-8682541785678079730.mp4'
  },
  {
    id: 4,
    static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0960.jpeg',
    loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1607792915860564384.mp4'
  },
  {
    id: 5,
    static: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0955.jpeg',
    loop: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-5300087847065473569.mp4'
  }
];

const ANGEL_IMAGE = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0966.gif';

// --- TYPES ---
interface HeartData {
  id: number;
  owner_name: string | null;
  last_lit_at: string;
  is_locked: boolean;
}

interface SparkParticle {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export default function VigilPage() {
  // State to hold DB data. Initially empty.
  const [dbHearts, setDbHearts] = useState<HeartData[]>([]);
  const [showManifesto, setShowManifesto] = useState(false);
  const [selectedHeart, setSelectedHeart] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [sparkParticles, setSparkParticles] = useState<SparkParticle[]>([]);
  const [isLighting, setIsLighting] = useState(false);
  
  const angelRef = useRef<HTMLDivElement>(null);
  const heartRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const supabase = createClient();

  // --- INITIALIZATION ---
  useEffect(() => {
    fetchHearts();
    setupRealtimeSubscription();
    
    // Show manifesto only on first visit
    if (!localStorage.getItem('vigil_visited')) {
      setShowManifesto(true);
      localStorage.setItem('vigil_visited', 'true');
    }
  }, []);

  // --- DATABASE FUNCTIONS ---
  const fetchHearts = async () => {
    const { data, error } = await supabase
      .from('vigil_hearts')
      .select('*');
    
    if (data) {
      setDbHearts(data);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('vigil_hearts_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vigil_hearts' },
        () => { fetchHearts(); } // Refresh data on any change
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  // --- LOGIC: Calculate Visual State ---
  const getHeartState = (heartId: number) => {
    // Find the DB record for this heart ID
    const dbRecord = dbHearts.find(h => h.id === heartId);

    // Default state (if not in DB or never lit)
    if (!dbRecord || !dbRecord.last_lit_at) {
      return {
        isAlive: false,
        owner: null,
        filter: 'grayscale(100%) brightness(0.3)',
        glow: 'none',
        scale: 0.95
      };
    }

    const now = new Date();
    const litTime = new Date(dbRecord.last_lit_at);
    const hoursPassed = (now.getTime() - litTime.getTime()) / (1000 * 60 * 60);
    const isAlive = hoursPassed < 24;

    let filter = '';
    let glow = '';
    let scale = 1;

    if (isAlive) {
      if (hoursPassed < 6) {
        // Phase 1: Burning Bright
        filter = 'brightness(1.2) saturate(1.2)';
        glow = '0 0 30px rgba(255, 50, 50, 0.6)';
        scale = 1.05;
      } else if (hoursPassed < 12) {
        // Phase 2: Normal
        filter = 'brightness(1) saturate(1)';
        glow = '0 0 15px rgba(255, 50, 50, 0.3)';
        scale = 1;
      } else {
        // Phase 3: Fading
        filter = 'grayscale(0.6) brightness(0.6)';
        glow = '0 0 5px rgba(255, 50, 50, 0.1)';
        scale = 0.98;
      }
    } else {
      // Phase 4: Dead (Stone)
      filter = 'grayscale(100%) brightness(0.3)';
      glow = 'none';
      scale = 0.95;
    }

    return {
      isAlive,
      owner: isAlive ? dbRecord.owner_name : null,
      filter,
      glow,
      scale
    };
  };

  // --- INTERACTION HANDLERS ---
  const handleHeartClick = (heartId: number) => {
    setSelectedHeart(heartId);
    setNameInput('');
  };

  const triggerRitual = async () => {
    if (!selectedHeart || !nameInput.trim() || isLighting) return;
    
    setIsLighting(true);
    
    // 1. Get Coordinates
    const angelRect = angelRef.current?.getBoundingClientRect();
    const targetRect = heartRefs.current[selectedHeart]?.getBoundingClientRect();
    
    if (angelRect && targetRect) {
      // 2. Calculate Spark Origin (Calibrated to the Candle Tip)
      // Assuming candle is roughly at 85% width (right hand) and 50% height
      const startX = angelRect.left + (angelRect.width * 0.85); 
      const startY = angelRect.top + (angelRect.height * 0.55);

      // Target center
      const endX = targetRect.left + (targetRect.width / 2);
      const endY = targetRect.top + (targetRect.height / 2);

      const sparkId = `spark-${Date.now()}`;
      
      // 3. Launch Spark
      setSparkParticles(prev => [...prev, { id: sparkId, startX, startY, endX, endY }]);
      
      // 4. Database Update (Delayed to match animation impact)
      setTimeout(async () => {
        // Remove spark
        setSparkParticles(prev => prev.filter(s => s.id !== sparkId));
        
        // Upsert to DB (Create if doesn't exist, Update if does)
        const { error } = await supabase
          .from('vigil_hearts')
          .upsert({
            id: selectedHeart,
            owner_name: nameInput.trim(),
            last_lit_at: new Date().toISOString()
          });
          
        if (!error) {
          setSelectedHeart(null); // Close modal
          setNameInput('');
        } else {
          console.error('Error lighting heart:', error);
        }
        setIsLighting(false);
      }, 1000); // 1 second flight time
    } else {
      setIsLighting(false);
    }
  };

  return (
    <div className="vigil-container">
      {/* Info Button */}
      <button 
        className="info-button"
        onClick={() => setShowManifesto(true)}
      >
        ?
      </button>

      <div className="room">
        {/* Angel Layer */}
        <div className="angel-layer" ref={angelRef}>
          <img src={ANGEL_IMAGE} className="angel-img" alt="Watcher" />
        </div>

        {/* Grid Layer */}
        <div className="shelves-grid">
          {HEARTS_DATA.map((asset) => {
            const state = getHeartState(asset.id);
            
            return (
              <div 
                key={asset.id}
                ref={el => {
                  heartRefs.current[asset.id] = el;
                }}
                className="heart-slot"
                onClick={() => handleHeartClick(asset.id)}
                style={{ transform: `scale(${state.scale})` }}
              >
                <div 
                  className="heart-inner"
                  style={{ 
                    filter: state.filter, 
                    boxShadow: state.glow 
                  }}
                >
                  {state.isAlive ? (
                    <video 
                      src={asset.loop} 
                      autoPlay loop muted playsInline 
                      className="heart-content" 
                    />
                  ) : (
                    <img 
                      src={asset.static} 
                      className="heart-content" 
                      alt="Empty Vessel" 
                    />
                  )}
                </div>
                
                {/* Tooltip / Label */}
                <div className="heart-label">
                  {state.owner ? state.owner : "VACANT"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Spark Layer */}
      <AnimatePresence>
        {sparkParticles.map(spark => (
          <motion.div
            key={spark.id}
            className="spark"
            initial={{ x: spark.startX, y: spark.startY, opacity: 1, scale: 1 }}
            animate={{ x: spark.endX, y: spark.endY, opacity: 0, scale: 0.5 }}
            transition={{ duration: 1, ease: "easeInOut" }}
          />
        ))}
      </AnimatePresence>

      {/* Modal: Input Name */}
      {selectedHeart !== null && (
        <div className="modal-backdrop" onClick={() => setSelectedHeart(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>LIGHT THIS SOUL</h3>
            <input 
              autoFocus
              type="text" 
              placeholder="Enter your Name" 
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isLighting && triggerRitual()}
              disabled={isLighting}
            />
            <button 
              onClick={triggerRitual}
              disabled={isLighting || !nameInput.trim()}
            >
              {isLighting ? 'IGNITING...' : 'IGNITE'}
            </button>
          </div>
        </div>
      )}

      {/* Modal: Manifesto */}
      {showManifesto && (
        <div className="modal-backdrop" onClick={() => setShowManifesto(false)}>
          <div className="modal-box manifesto" onClick={e => e.stopPropagation()}>
            <h2>THE VIGIL</h2>
            <p>The Internet is a cold void.<br/>Matter is dead until you touch it.</p>
            <p>These hearts are vessels.<br/>Click to transfer a spark of attention.<br/>Keep them warm, or they will turn to stone in 24 hours.</p>
            <p><i>We keep each other warm in the dark.</i></p>
            <button onClick={() => setShowManifesto(false)}>ENTER</button>
          </div>
        </div>
      )}

      <style jsx global>{`
        body { margin: 0; background: #000; color: white; overflow: hidden; }
        
        .vigil-container {
          position: relative;
          width: 100vw;
          height: 100vh;
          background: radial-gradient(circle at 50% 80%, #1a1a1a 0%, #000000 100%);
          perspective: 1000px;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .info-button {
          position: absolute;
          top: 20px; right: 20px;
          background: none; border: 1px solid #333; color: #555;
          width: 30px; height: 30px; border-radius: 50%;
          cursor: pointer; z-index: 100;
        }

        .room {
          position: relative;
          width: 100%;
          max-width: 1200px;
          height: 80vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .angel-layer {
          position: relative;
          z-index: 10;
          margin-bottom: 40px;
          /* Floating animation */
          animation: float 6s ease-in-out infinite;
        }
        
        .angel-img {
          width: 180px; /* Adjust based on your GIF size */
          opacity: 0.9;
        }

        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
          100% { transform: translateY(0px); }
        }

        .shelves-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr); /* 5 hearts in a row */
          gap: 30px;
          width: 100%;
          padding: 20px;
          z-index: 5;
        }

        /* Mobile: Stack them */
        @media (max-width: 768px) {
          .shelves-grid {
            grid-template-columns: repeat(2, 1fr);
            overflow-y: auto;
            max-height: 50vh;
          }
        }

        .heart-slot {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          transition: transform 0.3s;
          cursor: pointer;
        }
        .heart-slot:hover { transform: scale(1.05); }

        .heart-inner {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          overflow: hidden;
          background: #000;
          transition: all 1s ease; /* Smooth lighting transition */
        }

        .heart-content {
          width: 100%; height: 100%; object-fit: cover;
        }

        .heart-label {
          font-family: 'Courier New', monospace;
          font-size: 10px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .spark {
          position: fixed;
          width: 8px; height: 8px;
          background: #fff;
          box-shadow: 0 0 20px 5px gold;
          border-radius: 50%;
          z-index: 9999;
          pointer-events: none;
        }

        /* Modals */
        .modal-backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.8);
          display: flex; justify-content: center; align-items: center;
          z-index: 200;
          backdrop-filter: blur(5px);
        }
        .modal-box {
          background: #111;
          border: 1px solid #333;
          padding: 40px;
          text-align: center;
          max-width: 400px;
        }
        .modal-box h3, h2 { font-family: serif; margin-bottom: 20px; }
        .modal-box p { font-family: monospace; font-size: 12px; color: #aaa; line-height: 1.5; margin-bottom: 20px; }
        
        input {
          background: #000; border: 1px solid #444; color: white;
          padding: 10px; width: 100%; margin-bottom: 20px;
          font-family: monospace; text-align: center;
        }
        button {
          background: white; color: black; border: none;
          padding: 10px 30px; font-family: monospace; cursor: pointer;
          font-weight: bold;
        }
        button:hover { opacity: 0.8; }
      `}</style>
    </div>
  );
}