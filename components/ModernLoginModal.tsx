"use client";
import { useState, useEffect } from "react";
import { createPortal } from 'react-dom';
import { useAuth } from '@/components/AuthContext';
import { useRouter } from 'next/navigation';
import Onboard from '@web3-onboard/core';
import injectedModule from '@web3-onboard/injected-wallets';
import walletConnectModule from '@web3-onboard/walletconnect';
import { ethers } from 'ethers';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

const supabase = createBrowserClient();

export default function ModernLoginModal({ onClose }: { onClose?: () => void } = {}) {
  const { isLoading, session } = useAuth() as any;
  const status = isLoading ? 'loading' : (session ? 'authenticated' : 'unauthenticated');
  const auth = useAuth();
  const router = useRouter();
  const error = null; // ModernLoginModal shows supabase errors from signInWithOAuth; keep placeholder
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



  // Web3 login: supported here via Onboard (EIP-4361 SIWE flow)
  const handleWeb3 = async () => {
    // Close modal before launching Onboard UI so it won't be visually blocked
    if (typeof onClose === 'function') onClose();
    setLoading(true);
    setWeb3Error('');
    try {
      const walletConnect = walletConnectModule({
        projectId: '0083c29479d8ea22af3a3a44a447c439',
        requiredChains: [1],
      });
      const injected = injectedModule();
      const onboard = Onboard({
        wallets: [injected, walletConnect],
        chains: [
          {
            id: '0x1',
            token: 'ETH',
            label: 'Ethereum Mainnet',
            rpcUrl: 'https://mainnet.infura.io/v3/0083c29479d8ea22af3a3a44a447c439',
          },
        ],
        appMetadata: {
          name: 'newlove DApp',
          icon: '<svg></svg>',
          description: 'Авторизация через крипто-кошелек',
        },
      });
      const wallets = await onboard.connectWallet();
      if (!wallets || !wallets[0]) {
        setWeb3Error('Кошелек не подключен');
        setLoading(false);
        return;
      }
      const wallet = wallets[0];
      const address = wallet.accounts[0].address;
      const ethersProvider = new ethers.BrowserProvider(wallet.provider, 'any');
      const signer = await ethersProvider.getSigner();

      const domain = window.location.host;
      const uri = window.location.origin;
      const version = '1';
      const chainId = '1';
      const nonce = Math.floor(Math.random() * 1e16).toString();
      const issuedAt = new Date().toISOString();
      const statement = 'Sign in with Ethereum to the app.';
      const message = `${domain} wants you to sign in with your Ethereum account:\n${address}\n\n${statement}\n\nURI: ${uri}\nVersion: ${version}\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
      const signature = await signer.signMessage(message);
      const { data, error } = await supabase.auth.signInWithWeb3({ chain: 'ethereum', message, signature: signature as any });
      if (error) {
        setWeb3Error(error.message || String(error));
      } else {
        // Try to hydrate client-side session immediately so UI updates without a full page reload.
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const s = (sessionData as any)?.session || null;
          if (s && s.user) {
            // persist minimal user info to localStorage to notify other tabs and useSupabaseSession
            const toStore = { id: s.user.id, email: s.user.email, name: s.user.user_metadata?.name || s.user.name, image: s.user.user_metadata?.avatar_url || s.user.picture || s.user.image, role: s.user.role };
            try { localStorage.setItem('newlove_auth_user', JSON.stringify(toStore)); } catch (e) {}
            // Broadcast via BroadcastChannel if available
            try {
              if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('newlove-auth');
                try { bc.postMessage({ type: 'login', user: toStore }); } catch (e) {}
                try { bc.close(); } catch (e) {}
              }
            } catch (e) {}
            // Emit a global event that useSupabaseSession listens for
            try { window.dispatchEvent(new Event('supabase:session-changed')); } catch (e) {}
            // Also sync server-side cookie so Server Components see the session
            try {
              // POST access/refresh tokens to server endpoint which will set HttpOnly cookies
              await fetch('/api/auth/set-cookie', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at }),
              });
              // Force a server-side refresh so RSCs re-render with the authenticated session
              try { router.refresh(); } catch (e) { /* ignore */ }

              // Ensure an application-level user/profile row exists by upserting
              try {
                await fetch('/api/auth/upsert', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: s.user.id, email: s.user.email, name: s.user.user_metadata?.name || s.user.name || null, image: s.user.user_metadata?.avatar_url || s.user.picture || s.user.image || null }),
                });
              } catch (e) {
                // non-fatal: upsert failure should not block client UI
                console.warn('Failed to upsert app user after SIWE:', e);
              }
            } catch (e) {
              // non-fatal
              console.warn('Failed to sync session cookie with server:', e);
            }
          }
        } catch (e) {
          // ignore session hydration errors
        }
      }
    } catch (e: any) {
      setWeb3Error(e?.message || String(e));
    }
    setLoading(false);
  };

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
          <button
            onClick={async () => { try { if (typeof onClose === 'function') onClose(); await handleWeb3(); } catch (e){ /* ignore */ } }}
            className="w-full bg-emerald-600 text-white rounded-lg px-6 py-3 font-semibold text-lg hover:bg-emerald-700 transition mb-2 shadow"
            disabled={loading}
          >
            {loading ? 'Входим через Web3...' : 'Войти через Web3'}
          </button>
        {/* Web3 login intentionally removed — Google OAuth only */}
  {error && <div className="text-red-600 text-sm text-center mt-2">{error}</div>}
    {web3Error && <div className="text-red-600 text-sm text-center mt-2">{web3Error}</div>}
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
