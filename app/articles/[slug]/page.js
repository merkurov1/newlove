import { supabase } from '../../../lib/supabase'

async function getArticle(slug) {
  const { data: article, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error) {
    console.error('Error fetching article:', error)
    return null
  }

  return article
}

export default async function ArticlePage({ params }) {
  const resolvedParams = await params
  const { slug } = resolvedParams
  
  const article = await getArticle(slug)

  if (!article) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Статья не найдена
        </h1>
        <a href="/" className="text-blue-600 hover:text-blue-800">
          ← Вернуться на главную
        </a>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <article className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {article.title}
          </h1>
          <time className="text-gray-600">
            {new Date(article.published_at).toLocaleDateString('ru-RU')}
          </time>
        </header>

        <div className="prose prose-lg max-w-none">
          <div className="whitespace-pre-wrap text-gray-800">
            {article.content}
          </div>
        </div>

        <footer className="mt-12 pt-8 border-t border-gray-200">
          <a 
            href="/" 
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Вернуться на главную
          </a>
        </footer>
      </article>
    </div>
  )
}