'use client';

import { useSession } from 'next-auth/react';
import { useFormState } from 'react-dom';
import { subscribeToNewsletter } from '@/app/admin/actions'; // Импортируем наше новое действие
import { useEffect, useRef } from 'react';
import DonateButton from './DonateButton';

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

export default function Footer() {
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
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          <div className="md:col-span-1 flex flex-col gap-6">
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
                    // Если пользователь залогинен, показываем его email, иначе пустое поле
                    defaultValue={session?.user?.email ?? ''}
                    readOnly={!!session} // Делаем поле только для чтения, если пользователь залогинен
                    placeholder="your.email@example.com" 
                    required 
                    className={`w-full rounded-md border-gray-300 px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 ${session ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                  />
                  <SubmitButton />
                </div>
                {/* Сообщение об успехе или ошибке */}
                {state?.message && (
                  <p className={`text-sm ${state.status === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                    {state.message}
                  </p>
                )}
              </form>
            </div>
            <div>
              <DonateButton />
            </div>
          </div>
          
          <div className="md:col-span-2">
             {/* Здесь можно разместить другие ссылки, соцсети и т.д. */}
          </div>

        </div>
        <div className="mt-12 border-t border-gray-200 pt-8 text-center text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} Антон Меркуров. Все права защищены.</p>
        </div>
      </div>
    </footer>
  );
}


