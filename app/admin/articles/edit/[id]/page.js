// app/admin/articles/edit/[id]/page.js
// dynamic import to avoid circular/interop build issues
import { notFound } from 'next/navigation';
import ContentForm from '@/components/admin/ContentForm';
import { updateArticle } from '../../../actions';

async function getArticle(id) {
  const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
  const mod = await import('@/lib/supabase-server');
  const getUserAndSupabaseFromRequest = mod.getUserAndSupabaseFromRequest || mod.default || mod;
  const { supabase } = await getUserAndSupabaseFromRequest(globalReq);
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

export default async function EditArticlePage({ params }) {
  const article = await getArticle(params.id);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Редактирование публикации</h1>
      <ContentForm 
        initialData={article} 
        saveAction={updateArticle} 
        type="статью" 
      />
    </div>
  );
}
