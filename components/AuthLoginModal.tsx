"use client";

import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { useAuth } from './AuthContext';

type Ref = {
  open: () => void;
  close: () => void;
};

const AuthLoginModal = forwardRef<Ref, {}>((props, ref) => {
  const [open, setOpen] = useState(false);
  const auth = (() => { try { return useAuth(); } catch (e) { return null; } })();

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl p-8 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-gray-400">Sign In</div>
            <h3 className="text-2xl font-serif font-medium">Authenticate</h3>
          </div>
          <button aria-label="Close login" onClick={() => setOpen(false)} className="text-gray-500">✕</button>
        </div>

        <p className="text-sm text-gray-700 mb-6">Sign in to participate in discussions and subscribe to dispatches.</p>

        <div className="space-y-3">
          <button
            onClick={async () => { try { await auth?.signInWithGoogle(); } catch (e) { console.error(e); } }}
            className="w-full py-3 bg-black text-white rounded-md font-mono text-sm uppercase tracking-widest"
          >
            Continue with Google
          </button>

          <div className="text-center text-xs text-gray-500">Or</div>

          <a href="/lobby" className="block text-center text-sm text-gray-700 underline">Go to Lobby</a>
        </div>
      </div>
    </div>
  );
});

AuthLoginModal.displayName = 'AuthLoginModal';

export default AuthLoginModal;
