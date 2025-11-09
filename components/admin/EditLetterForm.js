'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateLetter, sendLetter } from '@/app/admin/actions';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import for EditorJS - only loads in admin panel
const EditorJsArticle = dynamic(() => import('@/components/admin/EditorJsArticle'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-100 rounded-lg h-64 flex items-center justify-center text-gray-500">Загрузка редактора...</div>
});

export default function EditLetterForm({ letter, subscriberCount }) {
  const [sendState, sendFormAction] = useFormState(sendLetter, { message: null, status: null });
  const [content, setContent] = useState(letter.content || '');
  useEffect(() => {
    setContent(letter.content || '');
  }, [letter.content]);
  
  function SendButton() {
    const { pending } = useFormStatus();
    return (
      <button 
        type="submit" 
        disabled={pending || !!letter.sentAt} // Также блокируем, если уже отправлено
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {pending ? 'Отправка...' : `Отправить ${subscriberCount} подписчикам`}
      </button>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Редактирование выпуска</h1>
      <p className="text-sm text-gray-500 mb-8">
        Статус: {letter.sentAt 
          ? `Отправлено ${new Date(letter.sentAt).toLocaleString('ru-RU')}` 
          : 'Черновик'}
      </p>

      {/* Форма для отправки (показывается только для черновиков) */}
      {!letter.sentAt && (
        <div className="mb-8 rounded-lg border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-800">Отправить рассылку</h2>
          <p className="text-sm text-red-700 mt-1 mb-4">
            Это действие нельзя будет отменить. Письмо будет отправлено всем активным подписчикам.
          </p>
          <form action={sendFormAction}>
            <input type="hidden" name="letterId" value={letter.id} />
            <SendButton />
          </form>
          {sendState?.message && (
            <p className={`mt-3 text-sm font-medium ${sendState.status === 'error' ? 'text-red-600' : 'text-green-600'}`}>
              {sendState.message}
            </p>
          )}
        </div>
      )}

      {/* Форма для редактирования контента письма */}
  <form action={updateLetter} className="space-y-6 bg-white p-4 sm:p-8 rounded-lg shadow-md">
        <input type="hidden" name="id" value={letter.id} />
        
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">Тема письма</label>
          <input type="text" name="title" id="title" required defaultValue={letter.title} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-base px-3 py-3" />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-gray-700">URL (slug)</label>
          <input type="text" name="slug" id="slug" required defaultValue={letter.slug} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-base px-3 py-3" />
        </div>
        <EditorJsArticle value={content} onChange={setContent} />
        <div className="flex items-center mt-2 mb-2">
          <input id="published" name="published" type="checkbox" defaultChecked={letter.published} className="h-6 w-6 rounded border-gray-300 text-blue-600" />
          <label htmlFor="published" className="ml-3 block text-base text-gray-900">Опубликовать в архиве</label>
        </div>
        <div className="mt-4">
          <button type="submit" className="w-full flex justify-center py-3 px-4 border rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 min-h-[44px]">
            Сохранить изменения
          </button>
        </div>
      </form>
    </div>
  );
}

