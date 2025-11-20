'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { motion, AnimatePresence } from 'framer-motion';

// Asset configuration
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
  const [hearts, setHearts] = useState<HeartData[]>([]);
  const [showManifesto, setShowManifesto] = useState(false);
  const [selectedHeart, setSelectedHeart] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [sparkParticles, setSparkParticles] = useState<SparkParticle[]>([]);
  const angelRef = useRef<HTMLDivElement>(null);
  const heartRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const supabase = createClient();

  // Load hearts from database
  useEffect(() => {
    loadHearts();
    setupRealtimeSubscription();
    
    // Show manifesto on first visit
    if (!localStorage.getItem('vigil_visited')) {
      setShowManifesto(true);
      localStorage.setItem('vigil_visited', 'true');
    }
  }, []);

  const loadHearts = async () => {
    const { data, error } = await supabase
      .from('vigil_hearts')
      .select('*')
      .order('id');
    
    if (data) {
      setHearts(data);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('vigil_hearts_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vigil_hearts' },
        (payload) => {
          loadHearts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const calculateHeartState = (lastLitAt: string) => {
    const now = new Date();
    const litTime = new Date(lastLitAt);
    const hoursPassed = (now.getTime() - litTime.getTime()) / (1000 * 60 * 60);
    
    const isAlive = hoursPassed < 24;
    
    let filter = '';
    let glow = '';
    let scale = 1;
    
    if (isAlive) {
      if (hoursPassed < 6) {
        filter = 'brightness(1.2) saturate(1.5)';
        glow = '0 0 30px rgba(255, 100, 100, 0.8), 0 0 60px rgba(255, 200, 50, 0.4)';
        scale = 1.05;
      } else if (hoursPassed < 12) {
        filter = 'brightness(1) saturate(1)';
        glow = '0 0 20px rgba(255, 100, 100, 0.5)';
        scale = 1;
      } else {
        filter = 'grayscale(0.5) brightness(0.7)';
        glow = '0 0 10px rgba(255, 100, 100, 0.3)';
        scale = 0.98;
      }
    } else {
      filter = 'grayscale(100%) brightness(0.3)';
      glow = '0 0 5px rgba(100, 100, 100, 0.2)';
      scale = 0.95;
    }
    
    return { isAlive, hoursPassed, filter, glow, scale };
  };

  const handleHeartClick = (heartId: number) => {
    setSelectedHeart(heartId);
    setNameInput('');
  };

  const lightHeart = async () => {
    if (!selectedHeart || !nameInput.trim()) return;
    
    // Get positions for spark animation
    const angelPos = angelRef.current?.getBoundingClientRect();
    const heartPos = heartRefs.current[selectedHeart]?.getBoundingClientRect();
    
    if (angelPos && heartPos) {
      const sparkId = `spark-${Date.now()}`;
      const spark: SparkParticle = {
        id: sparkId,
        startX: angelPos.left + angelPos.width / 2,
        startY: angelPos.top + angelPos.height / 3,
        endX: heartPos.left + heartPos.width / 2,
        endY: heartPos.top + heartPos.height / 2
      };
      
      setSparkParticles(prev => [...prev, spark]);
      
      // Remove spark after animation
      setTimeout(() => {
        setSparkParticles(prev => prev.filter(s => s.id !== sparkId));
        
        // Update database
        updateHeart();
      }, 1000);
    } else {
      // Fallback if positions not available
      updateHeart();
    }
  };

  const updateHeart = async () => {
    if (!selectedHeart) return;
    
    const { error } = await supabase
      .from('vigil_hearts')
      .update({
        owner_name: nameInput.trim(),
        last_lit_at: new Date().toISOString()
      })
      .eq('id', selectedHeart);
    
    if (!error) {
      setSelectedHeart(null);
      setNameInput('');
    }
  };

  return (
    <div className="vigil-container">
      {/* Info button */}
      <button 
        className="info-button"
        onClick={() => setShowManifesto(true)}
        aria-label="Show manifesto"
      >
        ?
      </button>

      {/* The Room */}
      <div className="room">
        {/* The Angel (floor) */}
        <div className="angel-container" ref={angelRef}>
          <img 
            src={ANGEL_IMAGE} 
            alt="The Angel" 
            className="angel-image"
          />
        </div>

        {/* The Shelves */}
        <div className="shelves">
          {hearts.map((heart) => {
            const heartAsset = HEARTS_DATA.find(h => h.id === heart.id);
            if (!heartAsset) return null;
            
            const state = calculateHeartState(heart.last_lit_at);
            
            return (
              <div
                key={heart.id}
                ref={(el) => {
                  heartRefs.current[heart.id] = el;
                }}
                className="heart-vessel"
                onClick={() => handleHeartClick(heart.id)}
                style={{
                  filter: state.filter,
                  boxShadow: state.glow,
                  transform: `scale(${state.scale})`,
                }}
                title={state.isAlive ? `Kept alive by ${heart.owner_name}` : 'Vacant. Waiting for a soul.'}
              >
                {state.isAlive ? (
                  <video
                    src={heartAsset.loop}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="heart-media"
                  />
                ) : (
                  <img
                    src={heartAsset.static}
                    alt={`Heart ${heart.id}`}
                    className="heart-media"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Spark Particles */}
      <AnimatePresence>
        {sparkParticles.map(spark => (
          <motion.div
            key={spark.id}
            className="spark-particle"
            initial={{ 
              x: spark.startX, 
              y: spark.startY,
              opacity: 1,
              scale: 0.5
            }}
            animate={{ 
              x: spark.endX, 
              y: spark.endY,
              opacity: [1, 1, 0],
              scale: [0.5, 1, 1.2]
            }}
            transition={{ 
              duration: 1,
              ease: [0.42, 0, 0.58, 1],
              times: [0, 0.8, 1]
            }}
            exit={{ opacity: 0 }}
          />
        ))}
      </AnimatePresence>

      {/* Name Input Modal */}
      {selectedHeart && (
        <div className="modal-overlay" onClick={() => setSelectedHeart(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Light the Heart</h2>
            <p className="modal-text">
              {hearts.find(h => h.id === selectedHeart)?.owner_name 
                ? 'Reignite this vessel with your presence' 
                : 'Claim this vacant vessel'}
            </p>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Your name"
              className="modal-input"
              autoFocus
              maxLength={50}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  lightHeart();
                }
              }}
            />
            <div className="modal-actions">
              <button onClick={lightHeart} className="modal-button-primary">
                Transfer Spark
              </button>
              <button onClick={() => setSelectedHeart(null)} className="modal-button-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manifesto Modal */}
      {showManifesto && (
        <div className="modal-overlay" onClick={() => setShowManifesto(false)}>
          <div className="modal-content manifesto" onClick={(e) => e.stopPropagation()}>
            <h2 className="manifesto-title">THE VIGIL</h2>
            <div className="manifesto-text">
              <p>The Internet is a cold void.<br/>Matter is dead until you touch it.</p>
              <p>These hearts are empty vessels.<br/>By clicking, you transfer a spark of attention—the only currency that matters.<br/>You occupy the vessel. You give it life.</p>
              <p>But attention fades.<br/>Every heart cools down. In 24 hours, it will turn back to stone, and your name will be erased.<br/>To keep it alive, you must return.</p>
              <p className="manifesto-closing">We keep each other warm in the dark.</p>
            </div>
            <button onClick={() => setShowManifesto(false)} className="modal-button-primary">
              Enter
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .vigil-container {
          min-height: 100vh;
          background: linear-gradient(180deg, #050505 0%, #1a1a1a 100%);
          color: #fff;
          font-family: 'Inter', -apple-system, sans-serif;
          perspective: 1000px;
          overflow: hidden;
          position: relative;
        }

        .info-button {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: #fff;
          font-size: 20px;
          font-weight: bold;
          cursor: pointer;
          z-index: 100;
          transition: all 0.3s;
          backdrop-filter: blur(10px);
        }

        .info-button:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: scale(1.1);
        }

        .room {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          transform-style: preserve-3d;
        }

        .angel-container {
          margin-bottom: 60px;
          transform: translateZ(-50px);
        }

        .angel-image {
          width: 200px;
          height: auto;
          filter: drop-shadow(0 10px 40px rgba(255, 200, 100, 0.6));
          animation: angelGlow 3s ease-in-out infinite;
        }

        @keyframes angelGlow {
          0%, 100% { filter: drop-shadow(0 10px 40px rgba(255, 200, 100, 0.6)); }
          50% { filter: drop-shadow(0 10px 60px rgba(255, 150, 50, 0.8)); }
        }

        .shelves {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 40px;
          max-width: 1200px;
          width: 100%;
          transform: translateZ(0);
        }

        .heart-vessel {
          aspect-ratio: 1;
          cursor: pointer;
          transition: all 0.5s ease;
          position: relative;
          border-radius: 8px;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.5);
        }

        .heart-vessel:hover {
          transform: translateY(-10px) scale(1.05) !important;
        }

        .heart-media {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .spark-particle {
          position: fixed;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 200, 50, 1) 0%, rgba(255, 100, 50, 0.8) 50%, transparent 100%);
          box-shadow: 0 0 20px rgba(255, 150, 50, 1), 0 0 40px rgba(255, 100, 50, 0.6);
          pointer-events: none;
          z-index: 1000;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          padding: 20px;
        }

        .modal-content {
          background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
        }

        .modal-title {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 20px;
          text-align: center;
          letter-spacing: 2px;
        }

        .modal-text {
          font-size: 16px;
          margin-bottom: 30px;
          text-align: center;
          color: rgba(255, 255, 255, 0.8);
          line-height: 1.6;
        }

        .modal-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #fff;
          padding: 15px 20px;
          font-size: 16px;
          border-radius: 8px;
          margin-bottom: 30px;
          transition: all 0.3s;
        }

        .modal-input:focus {
          outline: none;
          border-color: rgba(255, 150, 50, 0.6);
          box-shadow: 0 0 20px rgba(255, 150, 50, 0.3);
        }

        .modal-actions {
          display: flex;
          gap: 15px;
          justify-content: center;
        }

        .modal-button-primary {
          background: linear-gradient(135deg, #ff6b6b 0%, #ff5050 100%);
          border: none;
          color: #fff;
          padding: 15px 30px;
          font-size: 16px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .modal-button-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(255, 100, 100, 0.5);
        }

        .modal-button-secondary {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: rgba(255, 255, 255, 0.7);
          padding: 15px 30px;
          font-size: 16px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .modal-button-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .manifesto {
          max-width: 600px;
        }

        .manifesto-title {
          font-size: 36px;
          font-weight: 900;
          margin-bottom: 30px;
          text-align: center;
          letter-spacing: 4px;
        }

        .manifesto-text {
          font-size: 17px;
          line-height: 1.8;
          margin-bottom: 40px;
          color: rgba(255, 255, 255, 0.9);
        }

        .manifesto-text p {
          margin-bottom: 25px;
        }

        .manifesto-closing {
          font-style: italic;
          text-align: center;
          font-size: 18px;
          margin-top: 35px;
        }

        @media (max-width: 768px) {
          .shelves {
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
          }

          .angel-image {
            width: 150px;
          }

          .modal-content {
            padding: 30px 20px;
          }

          .manifesto-title {
            font-size: 28px;
          }

          .manifesto-text {
            font-size: 15px;
          }
        }
      `}</style>
    </div>
  );
}
