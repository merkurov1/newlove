'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

interface PasskeyAuthProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export default function PasskeyAuth({ onSuccess, onError }: PasskeyAuthProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePasskeySignIn = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported by this browser environment.');
      }

      const { error: authError } = await (supabase.auth as any).signInWithPasskey();
      if (authError) throw authError;

      if (onSuccess) onSuccess();
    } catch (err: any) {
      const errorMessage = err?.message || 'Passkey authentication failed';
      setError(errorMessage);
      if (onError) onError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeySignUp = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported by this browser environment.');
      }

      const signUpFn = (supabase.auth as any).signUpWithPasskey;
      if (!signUpFn) {
        throw new Error('Passkey registration is not supported in this client version.');
      }

      const { error: authError } = await signUpFn();
      if (authError) throw authError;

      if (onSuccess) onSuccess();
    } catch (err: any) {
      const errorMessage = err?.message || 'Passkey registration failed';
      setError(errorMessage);
      if (onError) onError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-rose-50 border-l-2 border-rose-600 p-3 text-xs font-mono text-rose-800 rounded-xl">
          {error}
        </div>
      )}
      
      <button
        type="button"
        onClick={handlePasskeySignIn}
        disabled={loading}
        className="w-full bg-white hover:bg-neutral-50 text-neutral-900 border border-neutral-300 font-mono text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50 flex items-center justify-center gap-2 font-bold rounded-xl shadow-sm"
      >
        🛡️ {loading ? 'Verifying Passkey...' : 'Sign in with Passkey'}
      </button>
    </div>
  );
}
