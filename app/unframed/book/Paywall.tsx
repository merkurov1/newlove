'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, ShieldCheck, CreditCard } from 'lucide-react';
import Link from 'next/link';

interface PaywallProps {
  onUnlock?: () => void;
}

export default function Paywall({ onUnlock }: PaywallProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleStripeCheckout = async () => {
    setLoading(true);
    try {
      const successUrl = window.location.origin + '/unframed/book?paid=1';
      const cancelUrl = window.location.origin + '/unframed/book';

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: 1500, // $15.00
          currency: 'usd', 
          successUrl, 
          cancelUrl,
          product: 'UNFRAMED Manuscript Access'
        }),
      });

      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setError(true);
        setLoading(false);
      }
    } catch (e) {
      setError(true);
      setLoading(false);
    }
  };

  const handleBypassAdmin = () => {
    if (onUnlock) {
      onUnlock();
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-6 relative selection:bg-red-600 selection:text-white font-sans">
      <div
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: `url("https://grainy-gradients.vercel.app/noise.svg")` }}
      />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full border border-zinc-800 p-10 bg-black shadow-2xl relative z-10"
      >
        <div className="flex items-center justify-between mb-8 text-red-500 font-mono text-[10px] uppercase tracking-widest border-b border-zinc-900 pb-4">
          <span className="flex items-center gap-2"><Lock size={12} /> Restricted Access</span>
          <span>Stripe Secured</span>
        </div>

        <h1 className="text-3xl font-black uppercase mb-3 tracking-tighter text-white font-sans">
          UNFRAMED / Manuscript
        </h1>
        <p className="font-serif text-zinc-400 text-sm mb-8 leading-relaxed">
          Full digital access to the memoir requires a secure purchase via Stripe or verified administrative clearance.
        </p>

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleStripeCheckout}
            disabled={loading}
            className="w-full bg-white text-black font-bold uppercase tracking-[0.2em] py-4 hover:bg-red-600 hover:text-white transition-all font-mono text-[10px] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <CreditCard size={14} />
            <span>{loading ? 'Connecting to Stripe...' : 'Unlock via Stripe ($15)'}</span>
          </button>

          {error && (
            <p className="text-red-500 font-mono text-[10px] uppercase tracking-wider text-center">
              &gt; Payment session error. Try again.
            </p>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-zinc-900 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleBypassAdmin}
            className="w-full bg-zinc-900 text-zinc-300 border border-zinc-800 font-mono text-[10px] uppercase tracking-widest py-3 hover:border-red-600 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShieldCheck size={14} className="text-red-500" />
            <span>Author / Admin Bypass</span>
          </button>

          <Link
            href="/unframed"
            className="text-center font-mono text-[10px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors pt-2"
          >
            ← Return to Dossier
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
