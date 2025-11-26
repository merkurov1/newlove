'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/lib/supabase-browser';
import TempleWrapper from '@/components/TempleWrapper';
import { motion, AnimatePresence } from 'framer-motion';

// --- CONFIG ---
const HEART_VIDEO = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-5300087847065473569.mp4'; 
const PRESETS = [5, 20, 100]; // USD Amounts

export default function TributePage() {
  const [amount, setAmount] = useState<number>(20);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Realtime State
  const [total24h, setTotal24h] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [lastDonor, setLastDonor] = useState<string | null>(null);

  const supabase = createClient();

  // --- 1. INIT & REALTIME ---
  useEffect(() => {
    fetchTotal();

    // Listen for GLOBAL donations (someone else pays -> heart beats)
    const channel = supabase
      .channel('tribute-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tributes' }, (payload) => {
        const newDonation = payload.new;
        if (newDonation.status === 'succeeded') {
            triggerPulse(newDonation.donor_name);
            fetchTotal(); // Refresh energy level
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchTotal = async () => {
    // Calculate energy (sum of last 24h)
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

  const triggerHaptic = (style: 'light' | 'medium' | 'heavy') => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred(style);
  };

  const triggerPulse = (donorName: string) => {
    setPulse(true);
    setLastDonor(donorName || "ANONYMOUS");
    triggerHaptic('heavy');
    setTimeout(() => setPulse(false), 800);
    setTimeout(() => setLastDonor(null), 4000);
  };

  // --- 2. PAYMENT LOGIC (TELEGRAM OPTIMIZED) ---
  const handleTribute = async () => {
    triggerHaptic('medium');
    setLoading(true);

    try {
      // 1. Get Payment Link from Server
      const res = await fetch('/api/tribute/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            amount, 
            currency: 'usd',
            donor_name: typeof window !== 'undefined' ? (localStorage.getItem('temple_user') || 'Pilgrim') : 'Pilgrim', 
            message: 'Fuel for the Temple' 
        }),
      });
      const data = await res.json();
      
      if (data.url) {
        const tg = (window as any).Telegram?.WebApp;
        
        if (tg && tg.openLink) {
            // TELEGRAM MODE: Open in external browser, keep App alive
            tg.openLink(data.url);
        } else {
            // WEB MODE: Redirect
            window.location.href = data.url;
        }
      } else {
        alert('Payment gateway busy. Try again.');
      }
    } catch (e) {
      console.error(e);
      alert('Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  // --- 3. DYNAMIC STYLES ---
  // Heart changes based on Total Energy Level
  const getHeartStyle = () => {
    // Levels: 0-50 (Dormant), 50-200 (Awake), 200+ (Radiant)
    let filter = 'grayscale(100%) sepia(80%) brightness(0.6) contrast(1.2)'; // Dormant
    let scale = 1;
    let opacity = 0.8;

    if (total24h > 50) { // Awake
        filter = 'grayscale(20%) sepia(40%) brightness(1.0) contrast(1.1) saturate(1.2)';
        opacity = 1;
    }
    if (total24h > 200) { // Radiant
        filter = 'grayscale(0%) sepia(0%) brightness(1.1) contrast(1.0) saturate(1.5)';
        scale = 1.05;
    }

    if (pulse) { // Beating state
        scale = 1.25;
        filter = 'brightness(1.5) saturate(2.0)';
        opacity = 1;
    }

    return { filter, scale, opacity };
  };

  const style = getHeartStyle();

  return (
    <div className="min-h-screen bg-black text-[#e5b863] font-mono flex flex-col items-center relative overflow-hidden">
      <Suspense fallback={null}><TempleWrapper /></Suspense>
      
      {/* AMBIENT GLOW (Reacts to energy) */}
      <div 
        className="absolute inset-0 pointer-events-none transition-opacity duration-1000"
        style={{ 
            background: 'radial-gradient(circle at center, rgba(255, 215, 0, 0.15) 0%, black 70%)',
            opacity: Math.min(total24h / 300, 0.8) 
        }} 
      />

      <div className="z-10 w-full max-w-md px-6 flex flex-col items-center h-screen justify-center py-10">
        
        {/* HEADER */}
        <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-[0.3em] text-white drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]">
                TRIBUTE
            </h1>
            <div className="text-[10px] text-[#886e36] tracking-[0.2em] uppercase mt-2">
                ENERGY LEVEL: ${total24h.toFixed(0)} / 24H
            </div>
        </div>

        {/* THE HEART ARTIFACT */}
        <div className="relative w-64 h-64 mb-12 flex items-center justify-center">
            <video 
                src={HEART_VIDEO} 
                autoPlay loop muted playsInline 
                className="w-full h-full object-cover rounded-full"
                style={{
                    filter: style.filter,
                    transform: `scale(${style.scale})`,
                    opacity: style.opacity,
                    transition: 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    boxShadow: total24h > 100 ? '0 0 50px rgba(255,215,0,0.2)' : 'none'
                }}
            />
            
            {/* DONOR TOAST */}
            <AnimatePresence>
                {lastDonor && (
                    <motion.div 
                        initial={{ opacity: 0, y: 30 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: -20 }}
                        className="absolute -bottom-12 text-white font-bold text-sm tracking-widest uppercase drop-shadow-[0_0_5px_gold]"
                    >
                        ⚡ {lastDonor}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* CONTROLS */}
        <div className="w-full space-y-6">
            {/* PRESETS */}
            <div className="flex gap-4 justify-center">
                {PRESETS.map(val => (
                    <button 
                        key={val} 
                        className={`flex-1 py-3 border border-[#443311] text-[#886e36] hover:text-[#e5b863] hover:border-[#e5b863] transition-all uppercase tracking-widest text-xs font-bold ${amount === val && !isCustom ? 'bg-[#e5b863] !text-black border-[#e5b863]' : ''}`}
                        onClick={() => { setAmount(val); setIsCustom(false); triggerHaptic('light'); }}
                    >
                        ${val}
                    </button>
                ))}
                <button 
                    className={`px-4 border border-[#443311] text-[#886e36] hover:text-[#e5b863] ${isCustom ? 'bg-[#e5b863] !text-black' : ''}`}
                    onClick={() => { setIsCustom(true); setAmount(0); triggerHaptic('light'); }}
                >
                    ...
                </button>
            </div>

            {/* CUSTOM INPUT */}
            <AnimatePresence>
                {isCustom && (
                    <motion.input 
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        type="number" 
                        className="w-full bg-[#110c05] border border-[#e5b863] text-[#e5b863] p-4 text-center font-mono text-xl outline-none placeholder-[#443311]"
                        placeholder="ENTER AMOUNT"
                        value={amount || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(Number(e.target.value))}
                        autoFocus
                    />
                )}
            </AnimatePresence>

            {/* PAY BUTTON */}
            <button 
                className="w-full bg-gradient-to-r from-[#e5b863] to-[#ffeec7] text-black py-4 text-sm font-bold tracking-[0.2em] uppercase hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale shadow-[0_0_20px_rgba(229,184,99,0.3)]"
                onClick={handleTribute}
                disabled={loading || amount <= 0}
            >
                {loading ? 'INITIATING...' : `OFFER $${amount}`}
            </button>
            
            <p className="text-[9px] text-[#443311] text-center uppercase tracking-wider leading-relaxed">
                Funds maintain the Temple servers.<br/>
                Energy is never lost, only transformed.
            </p>
        </div>
      </div>

      <style jsx global>{`
        body { background: #000; }
        /* Remove input arrows */
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  );
}