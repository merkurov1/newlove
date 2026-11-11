'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, CreditCard, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';

interface PaywallProps {
  onUnlock: () => Promise<boolean>;
  notice?: string | null;
}

async function readApiMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  } catch {
    // The response was not JSON.
  }

  return fallback;
}

export default function Paywall({ onUnlock, notice }: PaywallProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  useEffect(() => {
    if (!showAdminModal) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !adminLoading) {
        setShowAdminModal(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showAdminModal, adminLoading]);

  const handleStripeCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const pierrotAttribution = new URLSearchParams(window.location.search).get('pierrot');

      const res = await fetch('/api/unframed/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(pierrotAttribution ? { pierrotAttribution } : {}),
        }),
      });

      const data = (await res.json().catch(() => null)) as { url?: unknown } | null;

      if (res.ok && typeof data?.url === 'string' && data.url.startsWith('https://')) {
        window.location.assign(data.url);
        return;
      }

      if (res.status === 429) {
        setError('Too many checkout attempts. Please wait a moment and try again.');
      } else if (res.status === 503) {
        setError('Payments are temporarily unavailable. Please try again shortly.');
      } else {
        setError('Payment session error. Try again.');
      }
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setAdminLoading(true);
    try {
      const res = await fetch('/api/unframed/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: adminKey }),
      });

      if (!res.ok) {
        const message = await readApiMessage(res, 'Invalid administrative key.');
        setAdminError(
          res.status === 429
            ? 'Too many attempts. Please wait and try again.'
            : res.status >= 500
              ? 'Administrative access is temporarily unavailable.'
              : message
        );
        return;
      }

      const unlocked = await onUnlock();

      if (unlocked) {
        setShowAdminModal(false);
        setAdminKey('');
      } else {
        setAdminError('Access was granted, but the manuscript could not be opened. Please retry.');
      }
    } catch {
      setAdminError('Network error. Check your connection and try again.');
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-5 py-16 sm:px-6 relative selection:bg-red-600 selection:text-white font-sans">
      <div
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: `url("https://grainy-gradients.vercel.app/noise.svg")` }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full border border-zinc-800 p-6 bg-black shadow-2xl relative z-10 sm:p-10"
      >
        <div className="flex items-center justify-between gap-3 mb-8 text-red-500 font-mono text-[10px] uppercase tracking-widest border-b border-zinc-900 pb-4">
          <span className="flex items-center gap-2">
            <Lock size={12} /> Restricted Access
          </span>
          <span>Stripe Secured</span>
        </div>

        <h1 className="text-3xl font-black uppercase mb-3 tracking-tighter text-white">
          UNFRAMED / Manuscript
        </h1>
        <p className="font-serif text-zinc-400 text-sm mb-8 leading-relaxed">
          Full digital access to the memoir requires a secure purchase via Stripe or verified
          administrative clearance.
        </p>

        {notice && (
          <p
            role="status"
            className="mb-6 border border-amber-900/50 bg-amber-950/20 p-4 font-mono text-[10px] uppercase leading-relaxed tracking-wider text-amber-300"
          >
            {notice}
          </p>
        )}

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleStripeCheckout}
            disabled={loading}
            aria-busy={loading}
            className="w-full bg-white text-black font-bold uppercase tracking-[0.2em] py-4 hover:bg-red-600 hover:text-white transition-all font-mono text-[10px] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <CreditCard size={14} />
            <span>{loading ? 'Connecting to Stripe...' : 'Unlock via Stripe ($15)'}</span>
          </button>

          {error && (
            <p
              role="alert"
              className="text-red-500 font-mono text-[10px] uppercase tracking-wider text-center"
            >
              &gt; {error}
            </p>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-zinc-900 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              setAdminError(null);
              setShowAdminModal(true);
            }}
            className="w-full bg-zinc-900 text-zinc-300 border border-zinc-800 font-mono text-[10px] uppercase tracking-widest py-3 hover:border-red-600 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShieldCheck size={14} className="text-red-500" />
            <span>Author / Admin Login</span>
          </button>

          <Link
            href="/unframed"
            className="text-center font-mono text-[10px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors pt-2"
          >
            ← Return to Dossier
          </Link>
        </div>
      </motion.div>

      <AnimatePresence>
        {showAdminModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/80 backdrop-blur-sm"
            onClick={() => {
              if (!adminLoading) setShowAdminModal(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-clearance-title"
              className="max-w-sm w-full bg-black border border-zinc-800 p-8 relative"
              onClick={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowAdminModal(false)}
                disabled={adminLoading}
                aria-label="Close admin login"
                className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer disabled:opacity-40"
              >
                <X size={16} />
              </button>

              <h2
                id="admin-clearance-title"
                className="font-mono text-xs uppercase tracking-widest text-white mb-4"
              >
                Admin Clearance
              </h2>
              <form onSubmit={handleAdminAuth} className="space-y-4">
                <input
                  type="password"
                  placeholder="Enter admin key"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-red-600"
                  autoFocus
                  autoComplete="current-password"
                  aria-label="Admin key"
                  aria-invalid={Boolean(adminError)}
                  aria-describedby={adminError ? 'admin-auth-error' : undefined}
                />
                {adminError && (
                  <p
                    id="admin-auth-error"
                    role="alert"
                    className="text-red-500 font-mono text-[10px]"
                  >
                    {adminError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={adminLoading || !adminKey.trim()}
                  aria-busy={adminLoading}
                  className="w-full bg-red-600 text-white font-mono text-[10px] uppercase tracking-widest py-3 font-bold hover:bg-red-500 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {adminLoading ? 'Verifying...' : 'Authorize'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
