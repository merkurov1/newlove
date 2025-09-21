// app/api/articles/route.js
import { createClient } from '@/lib/supabase-server';

export async function POST(request) {
  const { title, content, slug } = await request.json();
  const supabase = createClient();

  try {
    const { error } = await supabase.from('articles').insert([
      {
        title,
        content,
        slug,
        published_at: new Date().toISOString(),
      },
    ]);

    if (error) throw error;

    return new Response(JSON.stringify({ message: '✅ Статья успешно добавлена!' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ message: `❌ Ошибка: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}