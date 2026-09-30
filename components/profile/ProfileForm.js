// components/profile/ProfileForm.js
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateProfile } from '@/app/admin/actions';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button 
      type="submit" 
      disabled={pending}
      className="w-full flex justify-center py-3.5 px-6 rounded-full text-xs font-mono uppercase tracking-widest text-white bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 transition-all shadow-lg shadow-zinc-900/10 active:scale-98"
    >
      {pending ? 'Saving Changes...' : 'Save Changes'}
    </button>
  );
}

export default function ProfileForm({ user }) {
  user = user || {};
  const initialState = { message: null, status: null };
  const [state, dispatch] = useFormState(updateProfile, initialState);
  const [showMessage, setShowMessage] = useState(false);
  const router = useRouter();

  function validateUsername(val) {
    return /^[a-z0-9_.]+$/.test(String(val || '').toLowerCase());
  }

  useEffect(() => {
    if (state.message) {
      setShowMessage(true);
      const timer = setTimeout(() => {
        setShowMessage(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
    try {
      if (state && state.status === 'success' && state.username) {
        router.push(`/you/${state.username}`);
      }
    } catch (e) {}
  }, [state, router]);

  return (
    <form action={dispatch} className="space-y-6 bg-white/70 backdrop-blur-2xl p-6 sm:p-10 rounded-3xl border border-zinc-200/80 shadow-[0_12px_40px_rgba(0,0,0,0.03)]">
      <div>
        <label htmlFor="username" className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">Username</label>
        <div className="flex rounded-2xl overflow-hidden border border-zinc-200 bg-white/50 focus-within:border-zinc-900 transition-all">
          <span className="inline-flex items-center px-4 py-3 bg-zinc-50 text-zinc-400 text-xs font-mono border-r border-zinc-200">
            merkurov.love/you/
          </span>
          <input 
            type="text" 
            name="username" 
            id="username" 
            required 
            defaultValue={user.username || ''} 
            className="flex-1 min-w-0 block w-full px-4 py-3 bg-transparent text-zinc-900 text-sm focus:outline-none" 
          />
        </div>
        {!validateUsername(user.username) && (
          <p className="text-xs font-mono text-amber-600 mt-2">Username can only contain lowercase letters, numbers, underscores, and dots.</p>
        )}
      </div>

      <div>
        <label htmlFor="name" className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">Display Name</label>
        <input 
          type="text" 
          name="name" 
          id="name" 
          required 
          defaultValue={user.name || ''} 
          className="w-full rounded-2xl border border-zinc-200 bg-white/50 px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:border-zinc-900 transition-all" 
        />
      </div>

      <div>
        <label htmlFor="bio" className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">Biography / Bio</label>
        <textarea 
          name="bio" 
          id="bio" 
          rows="3" 
          defaultValue={user.bio || ''} 
          className="w-full rounded-2xl border border-zinc-200 bg-white/50 px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:border-zinc-900 transition-all resize-none"
        ></textarea>
      </div>

      <div>
        <label htmlFor="website" className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">Website</label>
        <input 
          type="url" 
          name="website" 
          id="website" 
          defaultValue={user.website || ''} 
          placeholder="https://example.com" 
          className="w-full rounded-2xl border border-zinc-200 bg-white/50 px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:border-zinc-900 transition-all" 
        />
      </div>

      <div className="pt-2">
        <SubmitButton />
      </div>

      {showMessage && state.message && (
        <p className={`text-xs font-mono mt-4 ${state.status === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
