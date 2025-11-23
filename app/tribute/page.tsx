'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { createClient } from '@/lib/supabase-browser';
import TempleWrapper from '@/components/TempleWrapper';
import { motion, AnimatePresence } from 'framer-motion';

// --- CONFIG ---
// Используем то же видео сердца, но покрасим его в золото через CSS
const HEART_VIDEO = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-5300087847065473569.mp4'; 

const PRESETS = [5, 20, 100];

export default function TributePage() {
  const [amount, setAmount] = useState<number>(20);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [total24h, setTotal24h] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [lastDonor, setLastDonor] = useState<string | null>(null);

  const supabase = createClient();

  // --- 1. DATA & REALTIME ---
  useEffect(() => {
    fetchTotal();

    // Слушаем новые донаты в реальном времени
    const channel = supabase
      .channel('tribute-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tributes' }, (payload) => {
        const newDonation = payload.new;
        if (newDonation.status === 'succeeded') {
            triggerPulse(newDonation.donor_name);
            fetchTotal(); // Обновляем общую энергию
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchTotal = async () => {
    // Считаем сумму за последние 24 часа
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('tributes')
      .select('amount_cents')
      .eq('status', 'succeeded')
      .gte('created_at', yesterday);
    
    if (data) {
      const sumCents = data.reduce((acc, curr) => acc + curr.amount_cents, 0);
      setTotal24h(sumCents / 100);
    }
  };

  const triggerPulse = (donorName: string) => {
    setPulse(true);
    setLastDonor(donorName || "ANONYMOUS");
    
    // Звук монеты/удара (опционально)
    // const audio = new Audio('/sounds/coin_drop.mp3'); audio.play().catch(() => {});

    setTimeout(() => setPulse(false), 800);
    setTimeout(() => setLastDonor(null), 4000);
  };

 // --- 2. PAYMENT LOGIC ---
  const handleTribute = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tribute/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            amount, 
            currency: 'usd',
            donor_name: 'Pilgrim', // В будущем можно брать из инпута
            message: 'For the Golden Heart' 
        }),
      });
      const data = await res.json();
      
      if (data.url) {
        // FIX: Проверяем, мы в Телеграме или в вебе?
        const tg = (window as any).Telegram?.WebApp;
        
        if (tg && tg.openLink) {
            // ВАРИАНТ А: Мы в Телеграме. Открываем во внешнем браузере.
            // Храм остается висеть в фоне и ждет вебхук.
            tg.openLink(data.url);
        } else {
            // ВАРИАНТ Б: Мы в обычном браузере. Делаем редирект.
            window.location.href = data.url;
        }
      } else {
        alert('Payment gateway error');
      }
    } catch (e) {
      console.error(e);
      alert('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  // --- 3. VISUAL STATE CALCULATOR ---
  const getHeartStyle = () => {
    // DORMANT (< $50) -> AWAKE ($50-$500) -> RADIANT (> $500)
    let filter = 'grayscale(100%) sepia(100%) hue-rotate(5deg) saturate(200%) brightness(0.6) contrast(1.2)';
    let dropShadow = 'none';
    let scale = 1;

    if (total24h > 50) {
        // Awake
        filter = 'grayscale(100%) sepia(100%) hue-rotate(5deg) saturate(300%) brightness(1.0) contrast(1.1)';
        dropShadow = '0 0 30px rgba(255, 215, 0, 0.3)';
    }
    if (total24h > 200) {
        // Radiant
        filter = 'grayscale(100%) sepia(100%) hue-rotate(5deg) saturate(400%) brightness(1.3) contrast(1.3)';
        dropShadow = '0 0 60px rgba(255, 215, 0, 0.6)';
    }

    if (pulse) {
        scale = 1.3;
        filter = 'grayscale(100%) sepia(100%) hue-rotate(5deg) saturate(500%) brightness(2.0)';
        dropShadow = '0 0 100px rgba(255, 215, 0, 1)';
    }

    return { filter, dropShadow, scale };
  };

  const style = getHeartStyle();

  return (
    <div className="tribute-container">
      <Suspense fallback={null}><TempleWrapper /></Suspense>
      
      {/* Background Ambience */}
      <div className="bg-glow" style={{ opacity: Math.min(total24h / 500, 0.8) }} />

      <div className="content">
        <h1 className="title">TRIBUTE</h1>
        <div className="subtitle">ENERGY LEVEL: ${total24h.toFixed(0)} / 24H</div>

        {/* THE GOLDEN HEART */}
        <div className="heart-wrapper">
            <video 
                src={HEART_VIDEO} 
                autoPlay loop muted playsInline 
                className="golden-heart"
                style={{
                    filter: style.filter,
                    boxShadow: style.dropShadow, // Note: boxShadow works on div, drop-shadow filter on video content
                    transform: `scale(${style.scale})`
                }}
            />
            {/* Last Donor Toast */}
            <AnimatePresence>
                {lastDonor && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="donor-toast"
                    >
                        ⚡ {lastDonor}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* CONTROLS */}
        <div className="controls">
            <div className="presets">
                {PRESETS.map(val => (
                    <button 
                        key={val} 
                        className={`preset-btn ${amount === val && !isCustom ? 'active' : ''}`}
                        onClick={() => { setAmount(val); setIsCustom(false); }}
                    >
                        ${val}
                    </button>
                ))}
                <button 
                    className={`preset-btn ${isCustom ? 'active' : ''}`}
                    onClick={() => { setIsCustom(true); setAmount(0); }}
                >
                    ...
                </button>
            </div>

            {isCustom && (
                <input 
                    type="number" 
                    className="custom-input"
                    placeholder="ENTER AMOUNT"
                    value={amount || ''}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    autoFocus
                />
            )}

            <button 
                className="pay-btn"
                onClick={handleTribute}
                disabled={loading || amount <= 0}
            >
                {loading ? 'INITIATING...' : `OFFER $${amount}`}
            </button>
            
            <p className="disclaimer">
                Funds fuel the Temple's servers and future artifacts.<br/>
                Energy transforms into Light.
            </p>
        </div>
      </div>

      <style jsx global>{`
        body { background: #050505; color: #e5b863; font-family: 'Space Mono', monospace; overflow: hidden; }
        
        .tribute-container {
            width: 100vw; height: 100vh;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            position: relative;
            background: radial-gradient(circle at center, #1a1005 0%, #000 100%);
        }

        .bg-glow {
            position: absolute; inset: 0;
            background: radial-gradient(circle at center, rgba(255, 215, 0, 0.15) 0%, transparent 70%);
            pointer-events: none; transition: opacity 1s ease;
        }

        .content { z-index: 10; display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 400px; }

        .title { font-size: 32px; letter-spacing: 8px; margin-bottom: 5px; color: #fff; text-shadow: 0 0 20px rgba(255,215,0,0.5); }
        .subtitle { font-size: 12px; color: #886e36; margin-bottom: 40px; letter-spacing: 2px; }

        .heart-wrapper { position: relative; width: 200px; height: 200px; margin-bottom: 50px; display: flex; justify-content: center; align-items: center; }
        
        .golden-heart {
            width: 100%; height: 100%; border-radius: 50%; object-fit: cover;
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            /* The real magic happens in inline styles */
        }

        .donor-toast {
            position: absolute; bottom: -40px; 
            color: #fff; font-weight: bold; text-shadow: 0 0 10px gold;
            white-space: nowrap;
        }

        .controls { width: 100%; padding: 0 20px; }

        .presets { display: flex; gap: 10px; margin-bottom: 20px; justify-content: center; }
        .preset-btn {
            background: transparent; border: 1px solid #443311; color: #886e36;
            padding: 10px 0; flex: 1; cursor: pointer; font-family: 'Space Mono', monospace;
            transition: all 0.2s;
        }
        .preset-btn:hover { border-color: #e5b863; color: #e5b863; }
        .preset-btn.active { background: #e5b863; color: #000; border-color: #e5b863; font-weight: bold; box-shadow: 0 0 15px rgba(229, 184, 99, 0.4); }

        .custom-input {
            width: 100%; background: #110c05; border: 1px solid #e5b863; color: #e5b863;
            padding: 15px; text-align: center; font-family: 'Space Mono', monospace; font-size: 18px;
            outline: none; margin-bottom: 20px;
        }

        .pay-btn {
            width: 100%; background: linear-gradient(45deg, #e5b863, #ffeec7); 
            color: #000; border: none; padding: 18px;
            font-size: 16px; font-weight: bold; letter-spacing: 2px; cursor: pointer;
            text-transform: uppercase; transition: transform 0.2s;
        }
        .pay-btn:hover:not(:disabled) { transform: scale(1.02); box-shadow: 0 0 30px rgba(229, 184, 99, 0.5); }
        .pay-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }

        .disclaimer { margin-top: 20px; font-size: 10px; color: #443311; text-align: center; line-height: 1.5; }
      `}</style>
    </div>
  );
}