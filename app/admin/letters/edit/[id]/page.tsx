import { notFound } from 'next/navigation';
import ContentForm from '@/components/admin/ContentForm';
import { updateLetter } from '../../../actions';
import SendLetterForm from '@/components/admin/SendLetterForm';
import dynamic from 'next/dynamic';

const CloseableHero = dynamic(() => import('@/components/CloseableHero'), { ssr: false });

interface PageProps {
  params: Promise<{ id: string }> | { id: string };
}

export default async function EditLetterPage({ params }: PageProps) {
  const resolvedParams = params instanceof Promise ? await params : params;
  const letterId = resolvedParams.id;

  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');

  const globalReq = new Request('http://localhost', { headers: { cookie: cookieHeader } });
  const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
  const _ctx = await getUserAndSupabaseForRequest(globalReq);
  
  let supabase = _ctx?.supabase;
  if (!_ctx?.isServer || !supabase) {
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
    <div className="max-w-5xl mx-auto space-y-8 pb-16 font-sans">
      <CloseableHero />
      
      <div className="border-b border-neutral-200 pb-6">
        <h1 className="font-serif text-2xl sm:text-3xl tracking-tight text-neutral-900 mb-1">
          Редактирование выпуска
        </h1>
        <p className="font-mono text-xs text-neutral-500 uppercase tracking-wider">
          Управление контентом и рассылкой
        </p>
      </div>
      
      <ContentForm initialData={letter} saveAction={updateLetter} type="выпуск" />
      
      {letter.published ? (
        <div className="bg-white border border-neutral-200 p-8 space-y-6 rounded-none">
          <div className="border-b border-neutral-100 pb-4">
            <h2 className="font-serif text-lg text-neutral-900">
              Отправка рассылки подписчикам
            </h2>
            <p className="font-mono text-xs text-neutral-500 mt-1">
              Материал опубликован и готов к рассылке.
            </p>
          </div>
          <SendLetterForm letter={letter} />
        </div>
      ) : (
        <div className="bg-neutral-50 border border-neutral-200 p-6 rounded-none space-y-2">
          <h2 className="font-serif text-base text-neutral-800">
            Отправка рассылки недоступна
          </h2>
          <p className="font-mono text-xs text-neutral-500 leading-relaxed">
            Сначала опубликуйте письмо на сайте (отметьте галочку «Publish to Live Archive»), затем здесь появится возможность отправить рассылку подписчикам.
          </p>
        </div>
      )}
    </div>
  );
}
