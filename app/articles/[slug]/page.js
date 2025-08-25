import { supabase } from '../../../lib/supabase'
import Link from 'next/link'

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
  // В Next.js 15 params теперь Promise
  const resolvedParams = await params
  const { slug } = resolvedParams
  
  const article = await getArticle(slug)

  if (!article) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Статья не найдена
        </h1>
        <Link href="/" className="text-blue-600 hover:text-blue-800">
          ← Вернуться на главную
        </Link>
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

        {/* 🔥 вот картинка */}
        {article.image_url && (
          <img
            src={article.image_url}
            alt={article.title}
            className="w-full h-64 object-cover rounded-lg mb-6"
          />
        )}

        <div className="prose prose-lg max-w-none">
          <div className="whitespace-pre-wrap text-gray-800">
            {article.content}
          </div>
        </div>

        <footer className="mt-12 pt-8 border-t border-gray-200">
          <Link 
            href="/" 
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Вернуться на главную
          </Link>
        </footer>
      </article>
    </div>
  )
}