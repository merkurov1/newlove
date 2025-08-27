// app/pages/[slug]/page.js
import { supabase } from '@/lib/supabase-server'; 
import { notFound } from 'next/navigation';

async function getPageBySlug(slug) {
  const supabaseClient = supabase();
  const { data, error } = await supabaseClient
    .from('projects') // Make sure this is the correct table
    .select('*')
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

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl md:text-4xl font-bold mb-4">{page.title}</h1>
      <div className="prose lg:prose-xl">
        <p>{page.body}</p>
      </div>
    </div>
  );
}
