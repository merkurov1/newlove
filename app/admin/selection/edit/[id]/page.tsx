import { notFound } from 'next/navigation';
import ContentForm from '@/components/admin/ContentForm';
import { updateArticle } from '../../../actions';

async function getArticle(id: any) {
  const { cookies } = await import('next/headers');
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');
  const globalReq = new Request('http://localhost', { headers: { cookie: cookieHeader } });
  const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
  const _ctx = await getUserAndSupabaseForRequest(globalReq) || {};
  let supabase = _ctx?.supabase;
  if (!_ctx?.isServer || !supabase) {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    supabase = getServerSupabaseClient({ useServiceRole: true });
  }
  if (!supabase) notFound();
  const { data: articleRaw, error } = await supabase.from('articles').select('*').eq('id', id).maybeSingle();
  let article = articleRaw;
  if (article) {
    const { attachTagsToArticles } = await import('@/lib/attachTagsToArticles');
    const attached = await attachTagsToArticles(supabase, [article]);
    const a = Array.isArray(attached) ? attached[0] : null;
    article = a ? JSON.parse(JSON.stringify(a)) : JSON.parse(JSON.stringify(article));
  }
  if (error || !article) notFound();
  return article;
}

export default async function EditSelectionPage({ params }: { params: { id: string } }) {
  const article = await getArticle(params.id);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Редактирование публикации</h1>
      <ContentForm 
        initialData={article} 
        saveAction={updateArticle} 
        type="публикацию" 
      />
    </div>
  );
}
