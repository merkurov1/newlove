// app/admin/articles/edit/[id]/page.js
// dynamic import to avoid circular/interop build issues
import { notFound } from 'next/navigation';
import ContentForm from '@/components/admin/ContentForm';
import { updateArticle } from '../../../actions';

async function getArticle(id) {
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const serverSupabase = getServerSupabaseClient();
  if (!serverSupabase) notFound();
  const { data: article, error } = await serverSupabase.from('articles').select('*').eq('id', id).maybeSingle();
  if (error || !article) notFound();
  // load tags explicitly
  try {
    const { data: links } = await serverSupabase.from('_ArticleToTag').select('A,B').eq('A', article.id);
    const tagIds = (links || []).map(l => l.B).filter(Boolean);
    if (tagIds.length > 0) {
      const { data: tags } = await serverSupabase.from('Tag').select('id,name,slug').in('id', tagIds);
      article.tags = tags || [];
    } else {
      article.tags = [];
    }
  } catch (e) {
    console.error('Error loading tags for admin edit article', e);
    article.tags = [];
  }
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
