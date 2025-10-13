// app/admin/articles/edit/[id]/page.js
// dynamic import to avoid circular/interop build issues
import { notFound } from 'next/navigation';
import ContentForm from '@/components/admin/ContentForm';
import { updateArticle } from '../../../actions';

async function getArticle(id) {
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const serverSupabase = getServerSupabaseClient();
  if (!serverSupabase) notFound();
  const { data: article, error } = await serverSupabase.from('article').select('*, tags:tags(*)').eq('id', id).maybeSingle();
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
