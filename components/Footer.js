'use client';

import { useSession } from 'next-auth/react';
import { useFormState } from 'react-dom';
import { subscribeToNewsletter } from '@/app/admin/actions'; // Импортируем наше новое действие
import { useEffect, useRef } from 'react';
import DonateButton from './DonateButton';
import Image from 'next/image';

// Компонент для кнопки, который показывает статус отправки
function SubmitButton() {
  // `pending` больше не доступно в `useFormState`, используем `useFormStatus` в дочернем компоненте
  // Это правильный паттерн для Next.js / React
  // Вместо этого, мы просто покажем сообщение после отправки.
  return (
    <button type="submit" className="flex-shrink-0 rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">
      Подписаться
    </button>
  );
}

export default function Footer({ subscriberCount }) {
  const { data: session } = useSession();
  const formRef = useRef(null); // Ref для сброса формы

  // Начальное состояние для useFormState
  const initialState = { message: null, status: null };
  const [state, formAction] = useFormState(subscribeToNewsletter, initialState);

  // Сбрасываем форму после успешной подписки
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-col md:flex-row md:items-start md:justify-center gap-10">
          <div className="flex-1 max-w-md mx-auto md:mx-0 flex flex-col gap-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Присоединяйтесь к рассылке</h3>
              <p className="text-sm text-gray-500 mb-4">
                Получайте новые статьи и инсайты медиарынка прямо на почту. Без спама.
              </p>
              <form ref={formRef} action={formAction} className="space-y-3">
                <div className="flex items-start gap-2">
                  <input 
                    type="email" 
                    name="email"
                    defaultValue={session?.user?.email ?? ''}
                    readOnly={!!session}
                    placeholder="your.email@example.com" 
                    required 
                    className={`w-full rounded-md border-gray-300 px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 ${session ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                  />
                  <SubmitButton />
                </div>
                {state?.message && (
                  <p className={`text-sm ${state.status === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                    {state.message}
                  </p>
                )}
              </form>
            </div>
            <DonateButton />
          </div>
        </div>
        <div className="mt-10 border-t border-gray-200 pt-6 text-center text-xs text-gray-400">
          <p>&copy; {new Date().getFullYear()} Anton Merkurov. Все права защищены.</p>
          <p className="mt-2 text-xs text-gray-500">Subscribers: <span className="font-semibold">{subscriberCount}</span></p>
        </div>
      </div>
    </footer>
  );
}


