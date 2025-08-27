// app/pages/[slug]/page.js
import { supabase } from '@/lib/supabase-server'; 
import { notFound } from 'next/navigation';

async function getPageBySlug(slug) {
  const supabaseClient = supabase();
  const { data, error } = await supabaseClient
    .from('projects') // Make sure this is the correct table
    .select('id, title, created_at, content')
    .eq('slug', slug)
    .single();

  if (error) {
    console.error('Error fetching page:', error);
    return null;
  }
  return data;
}

export default async function Page({ params }) {
  const page = await getPageBySlug(params.slug);

  if (!page) {
    notFound();
  }
  
  // Handle cases where the date is null or invalid
  const formattedDate = page.created_at
    ? new Date(page.created_at).toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Дата не указана';

  return (
    <div className="max-w-3xl mx-auto my-8 p-8 bg-white rounded-lg shadow-xl border border-gray-100">
      <h1 className="text-3xl md:text-4xl font-bold mb-4">{page.title}</h1>
      <p className="text-gray-500 text-sm mb-6">Опубликовано: {formattedDate}</p>
      
      {/* Updated: Use dangerouslySetInnerHTML to render HTML content */}
      <div 
        className="prose lg:prose-xl"
        dangerouslySetInnerHTML={{ __html: page.content }} 
      />
    </div>
  );
}
