// components/profile/ProfileForm.js
'use client';

import { useActionState, useFormStatus } from 'react';
import { updateProfile } from '@/app/admin/actions';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button 
      type="submit" 
      disabled={pending}
      className="w-full flex justify-center py-3.5 px-6 rounded-full text-xs font-mono uppercase tracking-widest text-stone-100 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 transition-all shadow-md active:scale-98 cursor-pointer disabled:cursor-not-allowed"
    >
      {pending ? 'Saving Changes...' : 'Save Changes'}
    </button>
  );
}

export default function ProfileForm({ user }) {
  user = user || {};
  const initialState = { message: null, status: null };
  const [state, formAction] = useActionState(updateProfile, initialState);
  
  const [username, setUsername] = useState(user.username || '');
  const [showMessage, setShowMessage] = useState(false);
  const router = useRouter();

  function validateUsername(val) {
    if (!val) return true;
    return /^[a-z0-9_.]+$/.test(String(val));
  }

  const isUsernameValid = validateUsername(username);

  useEffect(() => {
    if (state?.message) {
      setShowMessage(true);
      const timer = setTimeout(() => {
        setShowMessage(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
    if (state?.status === 'success' && state?.username) {
      router.push(`/you/${state.username}`);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-6 bg-white/85 backdrop-blur-2xl p-6 sm:p-10 rounded-3xl border border-stone-200/80 shadow-sm">
      
      {/* Username Field */}
      <div>
        <label htmlFor="username" className="block text-xs font-mono uppercase tracking-widest text-stone-500 mb-2">
          Username
        </label>
        <div className="flex rounded-2xl overflow-hidden border border-stone-200 bg-white/50 focus-within:border-stone-900 transition-all">
          <span className="inline-flex items-center px-4 py-3 bg-stone-50 text-stone-400 text-xs font-mono border-r border-stone-200">
            merkurov.love/you/
          </span>
          <input 
            type="text" 
            name="username" 
            id="username" 
            required 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="flex-1 min-w-0 block w-full px-4 py-3 bg-transparent text-stone-900 text-sm focus:outline-none" 
          />
        </div>
        {!isUsernameValid && (
          <p className="text-xs font-mono text-amber-600 mt-2">
            Username can only contain lowercase letters, numbers, underscores, and dots.
          </p>
        )}
      </div>

      {/* Display Name Field */}
      <div>
        <label htmlFor="name" className="block text-xs font-mono uppercase tracking-widest text-stone-500 mb-2">
          Display Name
        </label>
        <input 
          type="text" 
          name="name" 
          id="name" 
          required 
          defaultValue={user.name || ''} 
          className="w-full rounded-2xl border border-stone-200 bg-white/50 px-4 py-3 text-sm text-stone-900 focus:outline-none focus:border-stone-900 transition-all" 
        />
      </div>

      {/* Biography Field */}
      <div>
        <label htmlFor="bio" className="block text-xs font-mono uppercase tracking-widest text-stone-500 mb-2">
          Biography / Bio
        </label>
        <textarea 
          name="bio" 
          id="bio" 
          rows="3" 
          defaultValue={user.bio || ''} 
          className="w-full rounded-2xl border border-stone-200 bg-white/50 px-4 py-3 text-sm text-stone-900 focus:outline-none focus:border-stone-900 transition-all resize-none font-serif"
        ></textarea>
      </div>

      {/* Website Field */}
      <div>
        <label htmlFor="website" className="block text-xs font-mono uppercase tracking-widest text-stone-500 mb-2">
          Website
        </label>
        <input 
          type="url" 
          name="website" 
          id="website" 
          defaultValue={user.website || ''} 
          placeholder="https://example.com" 
          className="w-full rounded-2xl border border-stone-200 bg-white/50 px-4 py-3 text-sm text-stone-900 focus:outline-none focus:border-stone-900 transition-all font-mono" 
        />
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <SubmitButton />
      </div>

      {/* Feedback Message */}
      {showMessage && state?.message && (
        <p className={`text-xs font-mono mt-4 p-3 rounded-2xl border ${state.status === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
