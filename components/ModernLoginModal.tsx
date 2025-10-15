"use client";
import { useState, useEffect } from "react";
import { createPortal } from 'react-dom';
import useSupabaseSession from '@/hooks/useSupabaseSession';
import { useAuth } from './AuthContext';
import Onboard from '@web3-onboard/core';
import injectedModule from '@web3-onboard/injected-wallets';
import walletConnectModule from '@web3-onboard/walletconnect';
import { ethers } from 'ethers';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

const supabase = createBrowserClient();

export default function ModernLoginModal({ onClose }: { onClose?: () => void } = {}) {
  const { status, error } = useSupabaseSession() as any;
  const auth = useAuth();
  const [loading, setLoading] = useState(false);
  const [web3Error, setWeb3Error] = useState('');
  const [mounted, setMounted] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  // Mount portal only on client to avoid SSR issues and ensure fixed positioning
  useEffect(() => {
    setMounted(true);
    const el = document.createElement('div');
    el.setAttribute('data-modal-root', 'true');
    document.body.appendChild(el);
    setPortalEl(el);
    return () => {
      try { document.body.removeChild(el); } catch (e) { /* ignore */ }
    };
  }, []);

  if (!mounted || status === 'authenticated') return null;



  // Web3 login is disabled for this project scope (Google OAuth only)

  const handleGoogle = async () => {
    // Close modal before redirecting to OAuth so UI isn't blocked
    if (typeof onClose === 'function') onClose();
    setLoading(true);
    try {
      // Ensure we redirect back to the current page after OAuth completes
  const redirectTo = typeof window !== 'undefined' ? window.location.href : undefined;
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } } as any);
      if (error) setWeb3Error(error.message);
    } catch (e: any) {
      setWeb3Error(e.message || String(e));
    }
    setLoading(false);
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={(e) => {
        // close when clicking backdrop
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col gap-6 items-center justify-center mx-auto relative"
        role="dialog"
        aria-modal="true"
        style={{
          minHeight: 320,
          minWidth: 320,
          maxWidth: 400,
          width: '100%',
          padding: '2.5rem',
          boxSizing: 'border-box',
        }}
      >
        <h2 className="text-3xl font-bold mb-4 text-center">Вход</h2>
        <button
          onClick={async () => { if (onClose) onClose(); setLoading(true); try { await auth.signInWithGoogle(); } catch (e:any) { setWeb3Error(e.message || String(e)); } setLoading(false); }}
          className="w-full bg-red-600 text-white rounded-lg px-6 py-3 font-semibold text-lg hover:bg-red-700 transition mb-2 shadow"
          disabled={loading}
        >
          {loading ? 'Входим через Google...' : 'Войти через Google'}
        </button>
        {/* Web3 login intentionally removed — Google OAuth only */}
  {error && <div className="text-red-600 text-sm text-center mt-2">{error}</div>}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-2xl font-bold bg-transparent border-none cursor-pointer"
          style={{ background: 'none', border: 'none', padding: 0 }}
          aria-label="Закрыть"
        >×</button>
      </div>
    </div>
  );

  if (portalEl) return createPortal(modalContent, portalEl);
  return null;
}
