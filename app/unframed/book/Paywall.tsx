'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Terminal, ArrowRight, ShieldCheck, Key } from 'lucide-react';
import Link from 'next/link';

interface PaywallProps {
  onUnlock: () => void;
}

export default function Paywall({ onUnlock }: PaywallProps) {
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState(false);

  const handleUnlockAttempt = (e: React.FormEvent) => {
    e.preventDefault();
    // Простой пример проверки секретного кода или админского доступа
    if (accessCode.trim() === 'MERKUROV2025' || accessCode.trim() === 'ADMIN') {
      onUnlock();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  const handleBypassAdmin = () => {
    // Мгновенный обход для администратора / автора
    onUnlock();
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-6 relative selection:bg-red-600 selection:text-white font-sans">
      {/* GLOBAL GRAIN */}
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
          <span>Secured Sector</span>
        </div>

        <h1 className="text-3xl font-black uppercase mb-3 tracking-tighter text-white font-sans">
          UNFRAMED / Manuscript
        </h1>
        <p className="font-serif text-zinc-400 text-sm mb-8 leading-relaxed">
          Full digital access to the memoir is restricted to authorized agents, subscribers, or the author.
        </p>

        <form onSubmit={handleUnlockAttempt} className="space-y-6">
          <div className="group">
            <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
              Access Code / Token
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-600">
                <Key size={14} />
              </span>
              <input
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="ENTER CODE"
                className="w-full bg-[#0a0a0a] border border-zinc-800 py-3 pl-10 pr-4 text-white font-mono text-sm focus:outline-none focus:border-red-600 transition-colors uppercase placeholder-zinc-700 rounded-none"
              />
            </div>
            {error && (
              <p className="text-red-500 font-mono text-[10px] mt-2 uppercase tracking-wider">
                &gt; Invalid access token. Access denied.
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-white text-black font-bold uppercase tracking-[0.2em] py-4 hover:bg-red-600 hover:text-white transition-all font-mono text-[10px] flex items-center justify-center gap-2"
          >
            <span>Decrypt &amp; Read</span>
            <ArrowRight size={14} />
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-zinc-900 flex flex-col gap-3">
          <button
            onClick={handleBypassAdmin}
            className="w-full bg-zinc-900 text-zinc-300 border border-zinc-800 font-mono text-[10px] uppercase tracking-widest py-3 hover:border-red-600 hover:text-white transition-all flex items-center justify-center gap-2"
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
