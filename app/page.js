import { supabase } from '@/lib/supabase-server'; 
import Link from 'next/link';

async function getArticles() {
  const supabaseClient = supabase(); 
  
  const { data, error } = await supabaseClient
    .from('articles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching articles:', error);
    return [];
  }
  return data;
}

export default async function HomePage() {
  const articles = await getArticles();

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold mb-6">Latest</h1>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {articles.length > 0 ? (
          articles.map((article) => (
            <div key={article.id} className="bg-white rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 p-6 border border-gray-100">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                <Link href={`/articles/${article.slug}`}>
                  <span className="text-blue-600 hover:text-blue-500 transition-colors duration-300">{article.title}</span>
                </Link>
              </h2>
              <p className="text-gray-600 mb-4 line-clamp-3">{article.body}</p>
              <Link href={`/articles/${article.slug}`} className="text-blue-500 font-medium hover:text-blue-400 transition-colors duration-300 inline-flex items-center">
                Читать далее
                <svg xmlns="http://www.w3.org/2000/svg" className="ml-1 w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 col-span-full">Пока нет статей.</p>
        )}
      </div>
    </div>
  );
}
