// Это теперь чистый Серверный Компонент. Директива 'use client' здесь не нужна.
// dynamic import to avoid circular/interop build issues
import { notFound } from 'next/navigation';

import ContentForm from '@/components/admin/ContentForm';
import { updateLetter } from '../../../actions';
import SendLetterForm from '@/components/admin/SendLetterForm';

export default async function EditLetterPage({ params }) {
  const letterId = params.id;
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const serverSupabase = getServerSupabaseClient();
  if (!serverSupabase) notFound();
  const { data: letter, error } = await serverSupabase.from('letter').select('*, tags:tags(*)').eq('id', letterId).maybeSingle();
  if (error || !letter) notFound();
  
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Редактирование выпуска рассылки</h1>
      
      <ContentForm initialData={letter} saveAction={updateLetter} type="выпуск" />
      
      {/* Форма отправки рассылки */}
      {letter.published ? (
        <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="text-xl font-semibold text-blue-900 mb-4">
            📧 Отправка рассылки подписчикам
          </h2>
          <SendLetterForm letter={letter} />
        </div>
      ) : (
        <div className="mt-8 p-6 bg-gray-50 border border-gray-200 rounded-lg">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            📧 Отправка рассылки
          </h2>
          <p className="text-gray-600">
            Сначала опубликуйте письмо на сайте, затем здесь появится возможность отправить рассылку подписчикам.
          </p>
        </div>
      )}
    </div>
  );
}


