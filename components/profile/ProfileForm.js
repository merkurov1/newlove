// components/profile/ProfileForm.js
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateProfile } from '@/app/admin/actions';
import { useEffect, useState } from 'react';

// Маленький компонент для кнопки, чтобы показывать статус отправки
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button 
      type="submit" 
      disabled={pending}
      className="w-full flex justify-center py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
    >
      {pending ? 'Сохранение...' : 'Сохранить изменения'}
    </button>
  );
}

export default function ProfileForm({ user }) {
  const initialState = { message: null, status: null };
  const [state, dispatch] = useFormState(updateProfile, initialState);
  const [showMessage, setShowMessage] = useState(false);

  // Показываем сообщение об успехе/ошибке на 3 секунды
  useEffect(() => {
    if (state.message) {
      setShowMessage(true);
      const timer = setTimeout(() => {
        setShowMessage(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  return (
  <form action={dispatch} className="space-y-6 bg-white p-4 sm:p-8 rounded-lg shadow-md">
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-gray-700">Username</label>
        <div className="mt-1 flex rounded-md shadow-sm flex-col sm:flex-row">
          <span className="inline-flex items-center px-3 py-2 rounded-t-md sm:rounded-l-md sm:rounded-t-none border border-b-0 sm:border-b border-gray-300 bg-gray-50 text-gray-500 text-sm">merkurov.love/you/</span>
          <input type="text" name="username" id="username" required defaultValue={user.username || ''} className="flex-1 min-w-0 block w-full px-3 py-3 rounded-b-md sm:rounded-r-md sm:rounded-b-none border-gray-300 text-base" />
        </div>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Ваше имя</label>
  <input type="text" name="name" id="name" required defaultValue={user.name || ''} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-base px-3 py-3" />
      </div>

      <div>
        <label htmlFor="bio" className="block text-sm font-medium text-gray-700">О себе</label>
  <textarea name="bio" id="bio" rows="3" defaultValue={user.bio || ''} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-base px-3 py-3"></textarea>
      </div>

      <div>
        <label htmlFor="website" className="block text-sm font-medium text-gray-700">Веб-сайт</label>
  <input type="url" name="website" id="website" defaultValue={user.website || ''} placeholder="https://example.com" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-base px-3 py-3" />
      </div>

      <div className="mt-4">
        <SubmitButton />
      </div>

      {/* Сообщение о статусе операции */}
      {showMessage && state.message && (
        <p className={`text-base mt-4 ${state.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
