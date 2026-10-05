'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { motion, AnimatePresence } from 'framer-motion';

import * as TempleWrapperMod from '@/components/TempleWrapper';
const TempleWrapper = (TempleWrapperMod as any).default || (TempleWrapperMod as any).TempleWrapper || TempleWrapperMod;

import * as SoundToggleMod from '@/components/SoundToggle';
const SoundToggle = (SoundToggleMod as any).default || (SoundToggleMod as any).SoundToggle || (() => null);

const HEART_VIDEO = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/-5300087847065473569.mp4'; 
const PRESETS = [5, 20, 100]; // USD Amounts

const supabase = createClient();

export default function TributePage() {
  const [amount, setAmount] = useState<number>(20);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [total24h, setTotal24h] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [lastDonor, setLastDonor] = useState<string | null>(null);

  useEffect(() => {
    fetchTotal();

    const channel = supabase
      .channel('tribute-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tributes' }, (payload: any) => {
        const newDonation = payload.new;
        if (newDonation?.status === 'succeeded') {
            triggerPulse(newDonation.donor_name);
            fetchTotal();
        }
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, []);

  const fetchTotal = async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('tributes')
      .select('amount_cents')
      .eq('status', 'succeeded')
      .gte('created_at', yesterday);
    
    if (data) {
      const sumCents = data.reduce((acc: number, curr: { amount_cents: number }) => acc + curr.amount_cents, 0);
      setTotal24h(sumCents / 100);
    }
  };

  const triggerHaptic = (style: 'light' | 'medium' | 'heavy') => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred(style);
  };

  const triggerPulse = (donorName: string) => {
    setPulse(true);
    setLastDonor(donorName || "PILGRIM");
    triggerHaptic('heavy');
    setTimeout(() => setPulse(false), 800);
    setTimeout(() => setLastDonor(null), 4000);
  };

  const handleTribute = async () => {
    triggerHaptic('medium');
    setLoading(true);
    setErrorMsg(null);

    try {
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

      if (!res.ok) {
        throw new Error('Payment gateway busy. Try again.');
      }

      const data = await res.json();
      
      if (data.url) {
        const tg = (window as any).Telegram?.WebApp;
        if (tg && tg.openLink) {
            tg.openLink(data.url);
        } else {
            window.location.href = data.url;
        }
      } else {
        setErrorMsg('Payment link generation failed.');
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  const getHeartStyle = () => {
    let filter = 'grayscale(80%) sepia(60%) brightness(0.8) contrast(1.1)';
    let scale = 1;
    let opacity = 0.9;

    if (total24h > 50) {
        filter = 'grayscale(20%) sepia(30%) brightness(1.1) contrast(1.05) saturate(1.3)';
        opacity = 1;
    }
    if (total24h > 200) {
        filter = 'grayscale(0%) sepia(0%) brightness(1.2) contrast(1.0) saturate(1.6)';
        scale = 1.06;
    }

    if (pulse) {
        scale = 1.25;
        filter = 'brightness(1.5) saturate(2.2)';
        opacity = 1;
    }

    return { filter, scale, opacity };
  };

  const style = getHeartStyle();

  return (
    <div className="min-h-screen bg-[#0c0904] text-[#ffd700] font-mono flex flex-col justify-between relative overflow-x-hidden selection:bg-[#ffd700] selection:text-black pt-40 sm:pt-44">
      <div className="noise-overlay" />
      {typeof TempleWrapper === 'function' ? <TempleWrapper /> : null}
      
      {/* RADIANT WARM GLOW */}
      <div 
        className="absolute inset-0 pointer-events-none transition-opacity duration-1000"
        style={{ 
            background: 'radial-gradient(circle at center, rgba(255, 215, 0, 0.22) 0%, rgba(12, 9, 4, 0.95) 75%)',
            opacity: Math.max(Math.min(total24h / 250, 1), 0.5) 
        }} 
      />

      {/* TOP BAR FIXED - Опущено ниже (top-24 / top-28) */}
      <div className="absolute top-24 sm:top-28 left-0 right-0 w-full max-w-md mx-auto px-6 flex justify-between items-center z-30">
        <Link 
          href="/temple"
          className="text-xs tracking-widest text-[#e5b863] hover:text-white transition-colors uppercase border border-[#e5b863]/30 px-4 py-2 rounded-full bg-[#1a1205]/70 backdrop-blur-md cursor-pointer shadow-[0_0_15px_rgba(255,215,0,0.15)]"
        >
          ← Temple
        </Link>
        {typeof SoundToggle === 'function' && <SoundToggle />}
      </div>

      <div className="z-10 w-full max-w-md mx-auto px-6 flex flex-col items-center justify-center py-6 flex-1">
        
        {/* HEADER */}
        <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-[0.35em] text-white drop-shadow-[0_0_20px_rgba(255,215,0,0.6)]">
                TRIBUTE
            </h1>
            <div className="text-[10px] text-[#e5b863] tracking-[0.25em] uppercase mt-2 font-semibold">
                ✨ RADIANT ENERGY: ${total24h.toFixed(0)} / 24H
            </div>
        </div>

        {/* THE HEART ARTIFACT */}
        <div className="relative w-52 h-52 sm:w-60 sm:h-60 mb-8 flex items-center justify-center">
            <video 
                src={HEART_VIDEO} 
                autoPlay loop muted playsInline 
                className="w-full h-full object-cover rounded-full"
                style={{
                    filter: style.filter,
                    transform: `scale(${style.scale})`,
                    opacity: style.opacity,
                    transition: 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    boxShadow: '0 0 60px rgba(255,215,0,0.35)'
                }}
            />
            
            <AnimatePresence>
                {lastDonor && (
                    <motion.div 
                        initial={{ opacity: 0, y: 30, scale: 0.9 }} 
                        animate={{ opacity: 1, y: 0, scale: 1 }} 
                        exit={{ opacity: 0, y: -20, scale: 0.9 }}
                        className="absolute -bottom-10 text-white font-bold text-xs tracking-widest uppercase drop-shadow-[0_0_8px_gold] text-center w-full bg-[#1a1205]/80 py-1 px-3 rounded-full border border-[#ffd700]/40 backdrop-blur-sm"
                    >
                        💛 {lastDonor} OFFERED LIGHT
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* CONTROLS */}
        <div className="w-full space-y-5">
            <div className="flex gap-3 justify-center">
                {PRESETS.map(val => (
                    <button 
                        key={val} 
                        className={`flex-1 py-3 border transition-all uppercase tracking-widest text-xs font-bold rounded-xl cursor-pointer ${
                          amount === val && !isCustom 
                            ? 'bg-gradient-to-r from-[#ffd700] to-[#ffea80] !text-black border-[#ffd700] shadow-[0_0_20px_rgba(255,215,0,0.4)] scale-105' 
                            : 'border-[#e5b863]/30 text-[#e5b863] hover:text-white hover:border-[#ffd700] bg-[#161004]/80'
                        }`}
                        onClick={() => { setAmount(val); setIsCustom(false); triggerHaptic('light'); setErrorMsg(null); }}
                    >
                        ${val}
                    </button>
                ))}
                <button 
                    className={`px-4 border rounded-xl cursor-pointer transition-all uppercase text-xs font-bold ${
                      isCustom 
                        ? 'bg-gradient-to-r from-[#ffd700] to-[#ffea80] !text-black border-[#ffd700] shadow-[0_0_20px_rgba(255,215,0,0.4)]' 
                        : 'border-[#e5b863]/30 text-[#e5b863] hover:text-white hover:border-[#ffd700] bg-[#161004]/80'
                    }`}
                    onClick={() => { setIsCustom(true); setAmount(0); triggerHaptic('light'); setErrorMsg(null); }}
                >
                    ...
                </button>
            </div>

            <AnimatePresence>
                {isCustom && (
                    <motion.input 
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        type="number" 
                        className="w-full bg-[#1a1205] border border-[#ffd700] text-[#ffd700] p-3.5 text-center font-mono text-lg rounded-xl outline-none placeholder-[#886e36] shadow-[0_0_15px_rgba(255,215,0,0.2)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="ENTER AMOUNT"
                        value={amount || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAmount(Number(e.target.value)); setErrorMsg(null); }}
                        autoFocus
                    />
                )}
            </AnimatePresence>

            {errorMsg && (
                <div className="text-[10px] text-rose-400 text-center uppercase tracking-widest animate-pulse font-bold">
                    {errorMsg}
                </div>
            )}

            <button 
                className="w-full bg-gradient-to-r from-[#ffd700] via-[#ffea80] to-[#ffe066] text-black py-4 rounded-xl text-xs font-black tracking-[0.2em] uppercase hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale shadow-[0_0_25px_rgba(255,215,0,0.5)] cursor-pointer"
                onClick={handleTribute}
                disabled={loading || amount <= 0}
            >
                {loading ? 'RADIATING...' : `OFFER $${amount} FOR THE TEMPLE`}
            </button>
            
            <p className="text-[10px] text-[#e5b863]/80 text-center uppercase tracking-wider leading-relaxed">
                Your tribute nourishes the Sanctuary.<br/>
                Energy flows, expands, and illuminates all.
            </p>
        </div>
      </div>

      <footer className="w-full text-center font-mono text-[9px] text-[#e5b863]/60 uppercase tracking-[0.3em] py-6 z-20">
        Merkurov Private Office &copy; {new Date().getFullYear()}
      </footer>

      <style jsx global>{`
        .noise-overlay {
          position: fixed; inset: 0; pointer-events: none; opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          z-index: 1;
        }
      `}</style>
    </div>
  );
}
