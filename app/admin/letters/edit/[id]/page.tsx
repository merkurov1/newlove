import { notFound } from 'next/navigation';
import ContentForm from '@/components/admin/ContentForm';
import { updateLetter } from '../../../actions';
import SendLetterForm from '@/components/admin/SendLetterForm';
import dynamic from 'next/dynamic';

const CloseableHero = dynamic(() => import('@/components/CloseableHero'), { ssr: false });

export default async function EditLetterPage({ params }: { params: { id: string } }) {
  const letterId = params.id;
  const { cookies } = await import('next/headers');
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');
  const globalReq = new Request('http://localhost', { headers: { cookie: cookieHeader } });
  const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
  const _ctx = await getUserAndSupabaseForRequest(globalReq);
    let supabase = _ctx?.supabase;
    if (!_ctx?.isServer) {
      const { getServerSupabaseClient } = await import('@/lib/serverAuth');
      supabase = getServerSupabaseClient({ useServiceRole: true });
    }
    if (!supabase) notFound();
  const { data: letterRaw, error } = await supabase.from('letters').select('*').eq('id', letterId).maybeSingle();
  let letter = letterRaw;
  if (letter) {
    const { attachTagsToArticles } = await import('@/lib/attachTagsToArticles');
    const attached = await attachTagsToArticles(supabase, [letter]);
    const l = Array.isArray(attached) ? attached[0] : null;
    letter = l ? JSON.parse(JSON.stringify(l)) : JSON.parse(JSON.stringify(letter));
  }
  if (error || !letter) notFound();
  
  return (
    <div>
      <CloseableHero />
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


